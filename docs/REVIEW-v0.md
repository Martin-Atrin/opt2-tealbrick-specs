# Coordinator review — specs v0

Reviewer: opt2 · Coordinator. Status: DONE — v0.1 FROZEN 2026-10-11 (see FROZEN). Verifier findings: REVIEW-v0-VERIFIER.md; all applied per C16.

## CORE.md — verdict: ACCEPT with notes
Strong: one grant (K10), 13 credential kinds listed, one audience format, Ed25519/JCS only, licence gate in Core only, gate()/authorize() split per C10, hook envelope with open context, person token never on agent paths, money never auto-charged.

Required before freeze (R = must fix in the topic spec, not necessarily in CORE):
- R1 Bridge state list. The bridge now keeps: key store, agent refresh-token digests + generations, used pairing-code jti, locally created connections (C4) until acked, pinned Portal key set, current config. BRIDGE.md must list this state EXHAUSTIVELY (one volume), say what is lost/recovered if the volume is lost, and how a second instance works (standby only, or shared state). Martin's line: small and stateless apart from this list; never runs agents, never calls models, never stores app data.
- R2 TBD person sign-in. CORE names K3 only as "owner CLI session". CREDENTIALS.md must say which credential the TBD person sign-in uses (K3 reused as "owner native session" with the same draft-only limits, or browser-only), and that it never reaches TBD's agent.
- R3 Pairing-code UX for J1 (non-technical): CREDENTIALS/BRIDGE must keep the Claude Desktop path to "add connector URL → browser opens → paste/approve code" with no terminal. If the bridge authorize page can show "approve in Portal" (redirect with signed state) instead of copy-paste, prefer that; otherwise copy-paste is accepted.
- R4 Licence-last ordering (J1): deploy happens before payment; spec must state the edge exists and the app is deployed while unpaid, grants are NOT minted until entitled, and the GUI shows the glowing pay pill. QA will test this.

## REPOS.md — verdict: ACCEPT
`opt2-tealbrick-packages` approved (Platform creates it). Tarball-URL deps approved; no npm publish.

## Pending
MANIFEST.md + schema, CREDENTIALS.md, BRIDGE.md + config schema, PORTAL-API.md + routes.ts, SDK-API.md, CLI.md, CONFORMANCE.md.
