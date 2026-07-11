# NewsDash → n8n → WhatsApp (WAHA) Automation Guide (100+ step checklist)

This guide explains, in **simple and very detailed steps**, how we set up **n8n** + **WAHA** and built a workflow that sends NewsDash category updates into **multiple WhatsApp groups** (AI, GitHub, Research, Global).

It is written so you can confidently explain **each step** to someone else without guessing.

---

## What you will achieve

1. Run **n8n** locally (Docker).
2. Run **WAHA** locally (Docker) and connect it to WhatsApp by scanning a QR.
3. Create an n8n workflow that:
   - builds a list of targets (label + NewsDash API URL + WhatsApp group `chatId`)
   - fetches news for each target
   - formats a short message (top headlines)
   - sends that message to the correct WhatsApp group using WAHA
4. Fix the “**only AI group receives messages**” issue by ensuring n8n routes **each item** to its own group.

---

## Glossary (quick)

1. **NewsDash**: your Next.js dashboard app that exposes endpoints like `/api/feeds`.
2. **n8n**: workflow automation tool (nodes connected in a pipeline).
3. **WAHA**: WhatsApp HTTP API (uses WhatsApp Web engine under the hood).
4. **Docker**: runs n8n and WAHA as containers.
5. **Workflow**: a saved automation in n8n.
6. **Node**: a step in the workflow (Manual Trigger, HTTP Request, Code, etc.).
7. **Item**: a unit of data passed between nodes in n8n (a workflow run may have many items).
8. **chatId**: WhatsApp’s identifier for a group/chat (often ends with `@g.us` for groups).

---

## Prerequisites

1. You are on Windows.
2. Docker Desktop is installed and running.
3. Your NewsDash app runs locally (usually `http://localhost:3000`).
4. You have access to WhatsApp on your phone (to scan QR).
5. You have created WhatsApp groups and you know their WAHA `chatId` values.

---

## Files used in this setup

1. `D:\n8n\docker-compose.yml` (runs n8n + WAHA)
2. An n8n workflow JSON file (import/export format)
3. This guide: `N8N_WAHA_WHATSAPP_AUTOMATION_GUIDE.md`

---

## Part A — Start n8n + WAHA (Docker Compose)

1. Create a folder `D:\n8n\` (if not already present).
2. Put your `docker-compose.yml` inside `D:\n8n\`.
3. Confirm your compose file contains:
   - one service for **n8n** (port `5678:5678`)
   - one service for **waha** (port `3001:3000` or similar mapping)
4. In your compose, confirm n8n has a persistent volume (so workflows are not lost).
5. In your compose, confirm WAHA exposes its API port.
6. Open PowerShell in `D:\n8n\`.
7. Start containers:
8. Run `docker compose up -d`.
9. Wait until containers show “running”.
10. Check containers:
11. Run `docker ps`.
12. Confirm you see containers similar to:
   - `newsdash-n8n`
   - `newsdash-waha`
13. If you don’t see them, check compose logs:
14. Run `docker compose logs -n 200`.
15. If Docker Desktop is not running, start Docker Desktop first.

---

## Part B — Open n8n and finish initial setup

16. Open your browser and go to `http://localhost:5678`.
17. If n8n asks for first-time setup, create a local owner account.
18. If you previously tried to log in with n8n cloud credentials:
19. Understand that local n8n uses its own local user database.
20. Use the local credentials you created for this instance.
21. If you see login loops or stale sessions:
22. Disable adblock/privacy extensions for `localhost:5678`.
23. Clear site data for `localhost:5678`.
24. Reload and log in again.
25. Once logged in, you should see the n8n dashboard.
26. Click “Workflows”.
27. Confirm you can create a workflow.

---

## Part C — Open WAHA and connect WhatsApp

28. Open WAHA UI in the browser (depending on your port mapping).
29. Example (common): `http://localhost:3001`.
30. If WAHA asks for dashboard login, use the configured username/password.
31. Create a WAHA session named `default` (or confirm it exists).
32. Start the session (important: created ≠ started).
33. WAHA will generate a QR code for that session.
34. On your phone: open WhatsApp → Linked devices → Link a device.
35. Scan the WAHA QR.
36. Wait until WAHA shows session status like **WORKING**.
37. If WAHA shows “Disconnected”, reconnect and refresh the UI.
38. If WAHA shows no QR code:
39. Confirm the session is started, not only created.
40. Confirm the WAHA container is running (`docker ps`).

---

## Part D — Verify WAHA can actually send a message

41. Before debugging n8n, verify WAHA can send any message at all.
42. Use a test message to a known `chatId` (your own number or a group).
43. The WAHA endpoint we used: `POST /api/sendText`.
44. WAHA expects JSON body containing:
   - `session`: the session name (example: `"default"`)
   - `chatId`: the destination chat/group id
   - `text`: message text
45. If WAHA returns `201`, sending works.
46. If WAHA returns `500`, WAHA/WhatsApp Web engine failed internally.
47. If WAHA returns `400`, the request is missing required fields.
48. In our case, WAHA returned “Session name is required” when `session` was missing.
49. Important: WAHA required `session` in the **body**, not in the URL query.

---

## Part E — NewsDash API requirements (what n8n calls)

50. Your NewsDash app must be running locally.
51. The workflow calls `GET /api/feeds` with query parameters:
52. Example categories we used:
53. `ai`
54. `github`
55. `research`
56. `global`
57. A typical request looks like:
58. `/api/feeds?category=ai&limit=8`
59. The response contains a JSON object with an `items` array.
60. Each item contains fields like `title`, `source`, `url`, `publishedAt`, etc.
61. The workflow formats a WhatsApp message from the top items.

---

## Part F — Build the workflow structure (nodes and purpose)

62. Create a new workflow in n8n.
63. Add a **Manual Trigger** node.
64. Purpose: run workflow on demand while testing.
65. Add a **Code** node named “Build Targets”.
66. Purpose: define *which categories go to which WhatsApp group*.
67. “Build Targets” outputs multiple items (one item per target).
68. Example fields per target:
   - `label` (human name like “AI (All)”)
   - `url` (NewsDash endpoint for that label)
   - `chatId` (WhatsApp group id to post into)
69. Add an **HTTP Request** node named “Fetch Domain News”.
70. Purpose: for each target item, fetch the news URL in that item.
71. Configure the HTTP Request node:
72. Method: `GET`
73. URL: `={{$json.url}}` (meaning: use each item’s URL)
74. Timeout option: something like 30000ms.
75. Add a **Code** node named “Format WhatsApp Message”.
76. Purpose: convert fetched feed items into one WhatsApp text per target.
77. Add an **HTTP Request** node named “Send to WhatsApp (WAHA)”.
78. Purpose: POST the message to WAHA.

---

## Part G — Build Targets node (exact behavior to explain)

79. Build Targets is a Code node that outputs **4 items**.
80. Each item contains the destination chatId and the URL to fetch.
81. Base URL for NewsDash from inside Docker can differ from host:
82. In our setup (n8n in Docker), we used:
83. `http://host.docker.internal:3000` to reach the host’s port 3000.
84. For each target:
85. AI target:
86. `url = BASE_URL + '/api/feeds?category=ai&limit=8'`
87. GitHub target:
88. `url = BASE_URL + '/api/feeds?category=github&limit=8'`
89. Research target:
90. `url = BASE_URL + '/api/feeds?category=research&limit=8'`
91. Global target:
92. `url = BASE_URL + '/api/feeds?category=global&limit=8'`
93. Each target also contains a different `chatId`.
94. If someone asks “Why is this needed?”:
95. Because it’s the routing table that maps category → WhatsApp group.

---

## Part H — Fetch Domain News node (exact behavior to explain)

96. This node runs once per item coming from Build Targets.
97. If Build Targets produced 4 items, this node makes 4 GET requests.
98. Each request uses that item’s `url`.
99. The output is 4 items, each containing:
100. `items`: array of news entries
101. `total`: count of items returned
102. `lastUpdated`: timestamp of cache/update
103. `category`: the category requested
104. If someone asks “How do you know it’s working?”:
105. Because the node output shows 4 items and each has category data.

---

## Part I — The “AI only” bug (what it was, in plain English)

106. You had 4 targets and 4 fetch results, but only the AI WhatsApp group received messages.
107. That happens when the workflow accidentally uses the *first target’s chatId* for every message.
108. In n8n, this mistake often happens if you reference:
109. `$node["Build Targets"].json.chatId`
110. That expression can resolve to item 0 (AI) when not indexed correctly.
111. Another common failure is returning only **one** item from the Format node.
112. Then the Send node can only send one message.

---

## Part J — Fix #1: Ensure WAHA request body is valid JSON

113. We saw errors like “The value in the JSON Body field is not valid JSON”.
114. Fix: ensure the HTTP Request node is sending actual JSON, not a broken template.
115. We used an expression that returns a full object:
116. `={{ { session: "default", chatId: ..., text: ... } }}`
117. We ensured the WAHA endpoint is:
118. `http://waha:3000/api/sendText`
119. We ensured `session` is inside the JSON body (WAHA required it).
120. If someone asks “Why not pass session in URL?”:
121. Because WAHA returned `400 Session name is required` when session was only in the query.

---

## Part K — Fix #2: Ensure Send node uses the current item

122. A reliable rule: the Send node should use the message values from the **current input item**.
123. That means using:
124. `$json.chatId`
125. `$json.text`
126. Not `$node["Format WhatsApp Message"].json...` (which can point to the wrong item).
127. Final JSON body expression we used:
128. `={{ { "session": "default", "chatId": $json.chatId, "text": $json.text } }}`
129. We also enabled “continue on fail” so one bad send does not stop all sends.

---

## Part L — Fix #3 (the key): Format node must output 4 messages

130. Your screenshots showed Fetch Domain News had 4 outputs, but Format output had 1.
131. So we changed Format node to run once for all items and return 4 items.
132. In n8n Code node settings, we used:
133. `mode = runOnceForAllItems`
134. Then in code, we used:
135. `const feeds = $input.all();` (all fetched results)
136. `const targets = $("Build Targets").all();` (all routing items)
137. We mapped them by index (feed 0 uses target 0, feed 1 uses target 1, etc.).
138. For each index, we created:
139. `chatId` (from target)
140. `text` (formatted headlines)
141. and returned one output item per target.

---

## Part M — Why index mapping is safe here

142. n8n preserves item ordering through linear pipelines in most cases.
143. Build Targets creates an ordered list: AI, GitHub, Research, Global.
144. Fetch Domain News processes items in that order and returns items in the same order.
145. Format node receives those same 4 items in the same order.
146. So `feeds[idx]` corresponds to `targets[idx]`.
147. If someone asks “What if the order changes?”:
148. You can include a `key` field in each target (like `category`) and match by key instead of index.
149. (We did not need that for this exact setup because ordering remained consistent.)

---

## Part N — How to verify it works (must-do checks)

150. Run the workflow.
151. Check “Build Targets” output count is 4.
152. Check “Fetch Domain News” output count is 4.
153. Check “Format WhatsApp Message” output count is 4.
154. Check “Send to WhatsApp (WAHA)” output count is 4.
155. If Send node shows only 1, the Format node is still returning only 1.
156. If Send node shows 4 but WhatsApp shows fewer:
157. Open each Send node run item and verify status code.
158. `201` means WAHA accepted it.
159. Any `400` means a missing parameter (often `session`).
160. Any `500` means WAHA engine error (often session or WhatsApp Web instability).

---

## Part O — Common errors and what they mean

161. **Port already in use**:
162. Another process is using the port (3000, 5678, 3001).
163. Fix: stop the old process or change ports.
164. **n8n can’t login**:
165. Browser cached bad cookies.
166. Fix: clear site data, disable extensions, restart container if needed.
167. **WAHA shows disconnected**:
168. Session not started or QR not scanned.
169. Fix: start session, scan QR again.
170. **WAHA 400 “Session name is required”**:
171. You did not send `"session":"default"` in JSON body.
172. Fix: ensure body includes session.
173. **WAHA 500 “includes of undefined”**:
174. `chatId` was undefined.
175. Fix: ensure `chatId` is a real string and expressions evaluate correctly.
176. **Only AI receives messages**:
177. Routing is stuck on the first item (AI).
178. Fix: in Send node use `$json.chatId` (current item).
179. Fix: in Format node output 4 items, not 1.

---

## Part P — “Explain like I’m new”: why we used Docker host mapping

180. n8n runs inside Docker, so `localhost:3000` inside the container is *not* your Windows host.
181. `host.docker.internal` is a special name that points from container → host.
182. That’s why we used:
183. `http://host.docker.internal:3000/api/feeds?...`
184. If someone runs NewsDash on a different port:
185. You must update the base URL.

---

## Part Q — Optional improvements (after it works)

186. Replace Manual Trigger with Schedule Trigger to run automatically.
187. Add deduplication (avoid reposting the same headlines).
188. Add rate limiting (avoid sending too often).
189. Add per-category templates (different formatting per group).
190. Add message chunking if WhatsApp rejects very long texts.

---

## Part R — Short “final workflow” summary you can say out loud

191. “First node builds a list of targets (AI/GitHub/Research/Global) with their API URL and WhatsApp group chatId.”
192. “Second node fetches news for each target URL.”
193. “Third node formats 1 WhatsApp message per target, producing 4 outputs.”
194. “Fourth node POSTs each formatted message to WAHA using session `default`.”
195. “Result: each WhatsApp group receives its own domain news.”

---

## Notes (to avoid confusion)

196. Always click **Execute workflow**, not “Execute step”, when you want all items to run.
197. If you are debugging, “Execute step” is useful for one node—but it can mislead you about multi-item flow.
198. If WhatsApp groups don’t receive messages:
199. Confirm you are looking at the same groups whose `chatId` values are in Build Targets.
200. Confirm WAHA session `default` is still **WORKING**.

