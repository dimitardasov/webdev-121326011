# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-27 | Gemini CLI | 24197 | 85 | – | ~$0.017 |
| 2026-10-27 | Gemini CLI | 27146 | 89 | – | ~$0.019 |
| 2026-11-05 | Gemini CLI | 16317 | 51 | – | ~$0 (free tier; 8 requests to gemini-3.8-flash got no answer) |
| 2026-11-05 | GitHub Copilot (Agent mode) | – | – | 1 request | |
| 2026-11-22 | GitHub Copilot (Agent mode) | – | – | 1.7 credits (last request; earlier requests today not recorded) |  |
| 2026-11-23 | GitHub Copilot (Agent mode) | – | – | 7.9 credits (1.5 + 2.3 + 0.7 + 0.5 + 0.4 + 0.3 + 0.4 + 1.8 est.; exact total in github.com/settings/billing) |  |

Prices: Gemini 3.8 Flash API list price, $0.75 per 1M input and $3.75 per 1M output tokens (introductory, through Dec 31, 2026). Flash-Lite tokens are not counted.