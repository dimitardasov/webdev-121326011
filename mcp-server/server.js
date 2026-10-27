const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

// Лекциите се четат веднъж, при стартиране на сървъра.
const lectures = JSON.parse(fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8'));

// Темите на една лекция като текст, разделени със запетая и интервал.
function topicsText(lecture) {
  return Array.isArray(lecture.topics) ? lecture.topics.join(', ') : String(lecture.topics);
}

// Резултат от инструмент: една текстова част и дали инструментът е неуспял.
function textResult(id, text, isError) {
  return { jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: text }], isError: isError } };
}

// Грешка в протокола: самото съобщение е сгрешено.
function protocolError(id, code, message) {
  return { jsonrpc: '2.0', id: id, error: { code: code, message: message } };
}

// Инструментите на сървъра. Моделът избира инструмент по описанието му.
const tools = [
  {
    name: 'find_lecture',
    description: 'Return the title and topics of one course lecture by its number, 1 to 12. Use it when asked what a specific lecture covers. Returns one line of text.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'Lecture number, 1 to 12' } },
      required: ['number'],
    },
  },
  {
    name: 'search_topic',
    description: 'Find which course lectures cover a given topic, such as "REST" or "ORM". Use it when asked where or when a topic is taught. Returns one line per matching lecture: its number and title.',
    inputSchema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'A word or phrase to look for in the lecture topics' } },
      required: ['topic'],
    },
  },
];

// Отпечатва един отговор като един ред JSON в stdout.
function send(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

// Решава какво да отговори. Връща отговора или null, ако не трябва да отговаря.
function handle(msg) {
  if (msg.method === 'initialize') {
    const params = msg.params || {};
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'lectures', version: '0.1.0' },
      },
    };
  }
  if (msg.method === 'notifications/initialized') {
    return null; // известие: няма id и не получава отговор
  }
  if (msg.method === 'tools/list') {
    return { jsonrpc: '2.0', id: msg.id, result: { tools: tools } };
  }
  if (msg.method === 'tools/call') {
    const params = msg.params || {};
    const name = params.name;
    const args = params.arguments || {};

    if (name === 'find_lecture') {
      // Аргумент, който не отговаря на схемата, е грешка в протокола.
      if (!Number.isInteger(args.number)) {
        return protocolError(msg.id, -32602, 'Invalid arguments: number must be an integer');
      }
      const lecture = lectures.find((l) => l.number === args.number);
      if (!lecture) {
        // Инструментът е работил, но не е успял: нормален резултат, маркиран с isError.
        return textResult(msg.id, 'There is no lecture ' + args.number + '. The course has lectures 1 to 12.', true);
      }
      return textResult(msg.id, 'Lecture ' + lecture.number + ': ' + lecture.title + '. Topics: ' + topicsText(lecture), false);
    }

    if (name === 'search_topic') {
      if (typeof args.topic !== 'string' || !args.topic.trim()) {
        return protocolError(msg.id, -32602, 'Invalid arguments: topic must be a non-empty string');
      }
      const wanted = args.topic.trim().toLowerCase();
      const found = lectures.filter((l) => topicsText(l).toLowerCase().includes(wanted));
      if (found.length === 0) {
        return textResult(msg.id, 'No lecture covers "' + args.topic + '". Try a shorter or different word.', true);
      }
      return textResult(msg.id, found.map((l) => l.number + '. ' + l.title).join('\n'), false);
    }

    // Инструмент, който не предлагаме: самото съобщение е грешно.
    return protocolError(msg.id, -32602, 'Unknown tool: ' + name);
  }
  if (msg.id !== undefined) {
    // Всяка друга заявка, която не познаваме.
    return protocolError(msg.id, -32601, 'Unknown method: ' + msg.method);
  }
  return null;
}

const lines = readline.createInterface({ input: process.stdin });

lines.on('line', (line) => {
  if (!line.trim()) return; // празен ред: пропускаме го
  console.error('got: ' + line);
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    // Редът не е валиден JSON: отговаряме с грешка, вместо да се сринем.
    send(protocolError(null, -32700, 'Parse error'));
    return;
  }
  const reply = handle(msg);
  if (reply) send(reply);
});