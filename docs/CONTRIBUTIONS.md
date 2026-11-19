# Contributions

Every member owns one part of the prototype and has a task in every phase. Each part was built on its own branch and merged into `main` by pull request, so the Git history shows who built what. Each member confirms or corrects their own row.

## Role matrix

| # | Member | Prototype part | Pull request |
|---|---|---|---|
| 1 | Naguma Elly | Design system and styles | Part 1 |
| 2 | Sellah Kenkyerengye | App shell and data model | Part 2 |
| 3 | Ivan Tweyongyere | Authentication and accounts | #3 |
| 4 | Amanya Kevin | Student discovery: Explore, hostel page, saved | #1 |
| 5 | Nantongo Jane | Custodian screens and visitor gate | #2 |
| 6 | Jotham Praise Onyango | Booking, mobile money payments and rent balance | #6 |
| 7 | Muyobo Arnold | Owner dashboard, money, staff and subscription | #7 |
| 8 | Wako Wallace | Hostel editor and file storage | #5 |
| 9 | Made Humphrey | Admin console; project set-up and integration (lead) | #4; merged #1 to #8 |
| 10 | Katawera Noel Ephraim | Backend core: business rules, sync and database security | #8 |

## Work by phase

| Member | Phase 1: analysis | Phase 2: journey and model | Phase 3: prototype and tests | Phase 4: architecture and security | Phase 5: report and demo |
|---|---|---|---|---|---|
| Naguma Elly | Phone access constraints; accessibility measure O6 | Accessibility considerations | Fixes D1, D7, D8; usability script | Web app component; accessibility in operations | Slide design; final accessibility check; F4 with Made |
| Sellah Kenkyerengye | Evidence and references | Traceability matrix | Test evidence and results; sample data | Data classification; usage limits | References; links file |
| Ivan Tweyongyere | Email confirmation risk; operational feasibility | Inclusion alternatives; sign-up step | Sign-up in T02; fix D8 (invite page) | Auth architecture; finding F1 | Fix F1; reproducibility check |
| Amanya Kevin | Student needs; student lane of Figure 1 | Journey stages 1 to 3; Persona 1 | T01; fixes D2, D3, D7 | Public data flows; maps | Timed user tests; guest demo |
| Nantongo Jane | Custodian and visitor stakeholders; exception E2 | Journey stages 6 and 7; Persona 4 | T03 custodian, T05; fix D8 (visitor form) | Visitor data and retention; finding F3 | Fix F3; consent and user tests; custodian demo |
| Jotham Praise Onyango | Payment steps and exceptions (Figure 2) | Journey stages 4 and 5; Persona 2 | T02, T08, T10 payments; fixes D4, D5 | Payment flow (Figure 7); finding F5 | Fix F5; payment demo |
| Muyobo Arnold | Owner needs; economic feasibility | Owner journey; revenue model; value measures | T03 owner; fixes D1, D4, D6, D7 | Owner data; gap G2 | Fix G2; SWOT; owner demo |
| Wako Wallace | Owner verification process (Figure 3) | Persona 3; owner value proposition | T04 listing data; editor checks | Listing data; photo storage rules | Deployment chapter |
| Made Humphrey | Problem statement, scope, schedule | Model type; Business Model Canvas | T04 admin; integration; demo plan | Architecture; operations; finding F4 | Report integration; README; submission |
| Katawera Noel Ephraim | Technical feasibility; overbooking controls | Order and inventory handling; planned tests | Test runner; T07, T09 | Access matrix; threats; F2; backups | Fix F2; backup job; restore drill |

## Task log

| Date (2026) | Task | Who | Evidence |
|---|---|---|---|
| 16 Nov | Project set-up: Vite, React, TypeScript | Made | 12838c2 |
| 16 Nov | Explore, hostel page and Saved screens | Amanya | PR #1 |
| 16 Nov | Custodian screens | Jane | PR #2 |
| 16 Nov | Authentication and accounts | Ivan | PR #3 |
| 16 Nov | Admin console | Made | PR #4 |
| 17 Nov | Hostel editor and file storage | Wallace | PR #5 |
| 17 Nov | Booking, mobile money payments and rent balance | Jotham | PR #6 |
| 17 Nov | Owner dashboard, money, staff and subscription | Arnold | PR #7 |
| 18 Nov | Backend core: business rules, sync, database security | Noel | PR #8 |
| | Design system and styles | Elly | Part 1 PR |
| | App shell and data model | Sellah | Part 2 PR |
| | Phase 3 fixes D1 to D8 | Owners above | One commit each |
| | Tests, README, contributions | Made | Commit |
| | Phase 4 fixes F1 to F5 | Owners above | One commit each |

Add the date and commit for each open row as it is done.

## Use of generative AI

The team used generative AI (Claude, by Anthropic) for drafting, code review, diagrams and test scripts, as declared in Appendix B of the report. Each member can explain and defend their own part.
