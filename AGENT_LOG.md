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

## 2026-11-05 · Exercise 2: spec and slice 1 with Claude
- Goal: SPEC.md, AGENTS.md and slice 1 (sign-in and the upcoming events list) for Club Events.
- Delegated: I chose the project (club events), the stack (Node, Express, PostgreSQL) and GitHub sign-in; Claude (claude.ai chat) drafted SPEC.md, AGENTS.md and .env.example and wrote the slice in src/, views/, public/ and test/.
- Checkpoints: I ran the slice in the codespace myself; AC-12 (redirect to /login, curl shows 302), AC-13 (three seeded events, no past one), AC-14 (deleted row disappears), AC-15 (sign out) all passed; checks/ex2.mjs 31/31.
- Went wrong: the full event shows "Full" instead of a number, which no criterion asked for.
- Changed by hand: AC-2 now says a full event shows "Full"; wrote the Spec vs result note.


## 2026-11-05 · Step 6 with Gemini CLI: does the agent read AGENTS.md
- Goal: ask Gemini what the "Always ask before" list says.
- Delegated: one question, nothing else.
- Checkpoints: the footer showed "1 AGENTS.md file · 1 MCP server", so the file was loaded.
- Went wrong: no answer; /stats shows 8 requests to gemini-3.8-flash with 0 tokens (quota). Switching to gemma-4-31b-it also hung.
- Changed by hand: nothing; repeated the check with Copilot.

## 2026-11-05 · Step 6 with GitHub Copilot: does the agent read AGENTS.md
- Goal: the same question, in Copilot Chat Agent mode.
- Delegated: one question, nothing else.
- Checkpoints: Copilot listed all nine lines, from "deleting files or folders" to "sending user data to a third-party model", matching the file.
- Went wrong: nothing.
- Changed by hand: nothing.
