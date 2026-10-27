# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

## 2026-10-27 · Connect Gemini CLI to my MCP server
- Goal: Check that Gemini CLI starts my server and calls find_lecture without being told the tool name.
- Delegated: Answering "What does lecture 7 cover?" using my MCP tools.
- Checkpoints: /mcp showed my-project as Ready with find_lecture and search_topic; Gemini asked permission and called find_lecture(number: 7); the answer matched lectures.json.
- Went wrong: Gemini first skipped project settings because the folder was untrusted; I had to trust the folder and log in with an API key.
- Changed by hand: Nothing in the code.

## 2026-10-27 · Description experiment
- Goal: See whether a vague tool description changes which tool Gemini picks.
- Delegated: The same question, "What does lecture 7 cover?", with find_lecture described only as "Does lecture stuff.".
- Checkpoints: Gemini still called find_lecture(number: 7) and gave the same answer.
- Went wrong: Nothing failed; the vague description also broke the self-check's 20-character rule, so I restored it.
- Changed by hand: I edited the description in server.js before the session and restored the original after it; self-check back to 12/12.
