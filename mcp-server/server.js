const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const { ServiceError } = require('../src/services/errors');

// Lectures are read once when the server module is loaded.
const lectures = JSON.parse(fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8'));

function topicsText(lecture) {
  return Array.isArray(lecture.topics) ? lecture.topics.join(', ') : String(lecture.topics);
}

function textResult(id, text, isError) {
  return {
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }], isError },
  };
}

function protocolError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

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
  {
    name: 'list_upcoming_events',
    description: 'List upcoming events and free places for the signed-in member. Use when they ask to browse events; returns event details as JSON text.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'register_for_event',
    description: 'Sign the signed-in member up for an upcoming event. Use when they ask to join an event; returns a confirmation or service error.',
    inputSchema: {
      type: 'object',
      properties: { eventId: { type: 'integer', description: 'The event id' } },
      required: ['eventId'],
    },
  },
  {
    name: 'cancel_registration',
    description: 'Cancel the signed-in member’s own event registration. Use when they ask to withdraw; returns a confirmation or service error.',
    inputSchema: {
      type: 'object',
      properties: { eventId: { type: 'integer', description: 'The event id' } },
      required: ['eventId'],
    },
  },
];

function createDatabaseServices() {
  return require('../src/mcp-services').createMcpServices();
}

async function initializeProjectTools({ env = process.env, services } = {}) {
  if (!env.MCP_EMAIL || !env.MCP_PASSWORD) {
    return { error: 'Set MCP_EMAIL and MCP_PASSWORD to enable project tools.' };
  }
  if (!services && !env.DATABASE_URL) {
    return { error: 'Set DATABASE_URL to enable project tools.' };
  }

  try {
    const configured = services || createDatabaseServices();
    const user = await configured.auth.signIn(env.MCP_EMAIL, env.MCP_PASSWORD);
    return { ...configured, user };
  } catch (error) {
    return {
      error: error instanceof ServiceError
        ? error.message
        : 'Project tools are unavailable. Check the database connection and MCP credentials.',
    };
  }
}

function createHandler(projectTools) {
  return async function handle(msg) {
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
    if (msg.method === 'notifications/initialized') return null;
    if (msg.method === 'tools/list') {
      return { jsonrpc: '2.0', id: msg.id, result: { tools } };
    }
    if (msg.method === 'tools/call') {
      const params = msg.params || {};
      const name = params.name;
      const args = params.arguments || {};

      if (name === 'find_lecture') {
        if (!Number.isInteger(args.number)) {
          return protocolError(msg.id, -32602, 'Invalid arguments: number must be an integer');
        }
        const lecture = lectures.find((item) => item.number === args.number);
        if (!lecture) {
          return textResult(
            msg.id,
            `There is no lecture ${args.number}. The course has lectures 1 to 12.`,
            true,
          );
        }
        return textResult(
          msg.id,
          `Lecture ${lecture.number}: ${lecture.title}. Topics: ${topicsText(lecture)}`,
          false,
        );
      }

      if (name === 'search_topic') {
        if (typeof args.topic !== 'string' || !args.topic.trim()) {
          return protocolError(msg.id, -32602, 'Invalid arguments: topic must be a non-empty string');
        }
        const wanted = args.topic.trim().toLowerCase();
        const found = lectures.filter((item) => topicsText(item).toLowerCase().includes(wanted));
        if (found.length === 0) {
          return textResult(
            msg.id,
            `No lecture covers "${args.topic}". Try a shorter or different word.`,
            true,
          );
        }
        return textResult(msg.id, found.map((item) => `${item.number}. ${item.title}`).join('\n'), false);
      }

      if (name === 'list_upcoming_events'
        || name === 'register_for_event'
        || name === 'cancel_registration') {
        if (name !== 'list_upcoming_events' && !Number.isInteger(args.eventId)) {
          return protocolError(msg.id, -32602, 'Invalid arguments: eventId must be an integer');
        }
        if (projectTools.error) return textResult(msg.id, projectTools.error, true);

        try {
          if (name === 'list_upcoming_events') {
            const events = await projectTools.events.listUpcoming(projectTools.user);
            return textResult(msg.id, JSON.stringify(events), false);
          }
          if (name === 'register_for_event') {
            await projectTools.registrations.register(projectTools.user, args.eventId);
            return textResult(msg.id, 'You are signed up', false);
          }
          await projectTools.registrations.cancel(
            projectTools.user,
            args.eventId,
            projectTools.user.id,
          );
          return textResult(msg.id, 'Registration cancelled.', false);
        } catch (error) {
          const message = error instanceof ServiceError
            ? error.message
            : 'Project tool is temporarily unavailable.';
          return textResult(msg.id, message, true);
        }
      }

      return protocolError(msg.id, -32602, `Unknown tool: ${name}`);
    }
    if (msg.id !== undefined) {
      return protocolError(msg.id, -32601, `Unknown method: ${msg.method}`);
    }
    return null;
  };
}

async function start() {
  const projectTools = await initializeProjectTools();
  const handle = createHandler(projectTools);
  const lines = readline.createInterface({ input: process.stdin });

  lines.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify(protocolError(null, -32700, 'Parse error'))}\n`);
      return;
    }
    const reply = await handle(msg);
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { createHandler, initializeProjectTools, tools };
