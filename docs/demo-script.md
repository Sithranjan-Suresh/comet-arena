# Launch demo (90 seconds)

For club officers, the Student Org Center, Nebula Labs, and portfolio demos. Rehearse on a phone over cellular,
not on Wi-Fi.

## Before you start (2 minutes)

- [ ] Production URL open in a phone browser, signed in as a test student, calendar app set up.
- [ ] `DEMO_CACHE=1` is set on this deployment (the signature flyer falls back to its saved result if the model is slow).
- [ ] The signature flyer is saved to the phone's photos. Use fixture `f01-ais-case.png` for a dry run, then replace it with a real flyer and re-run `npm run eval` so its cached result matches.
- [ ] Test account has no existing save for that competition (so Save is visible).
- [ ] Standings page shows real past results, labeled as past (never invented numbers).
- [ ] Airplane-mode test: the cached fallback still produces the listing within 6 seconds.

## Script

1. **Hook, The Field (0:00)**
   "UTD had over forty competitions this semester. Most students saw maybe five. Here is every one of them."
   Scroll the list; point at the countdowns and the soonest deadline.
2. **Report a Game (0:15)** the signature moment.
   "Clubs post flyers like this." Choose the photo. Fields fill in: title, every round, deadlines, eligibility,
   registration link. Say "That is a real flyer, read in about four seconds." Tap Publish.
3. **Save and Schedule (0:40)**
   Open the Game Day page, tap Save, open Schedule. "Every round is on my calendar, and a week before each
   deadline I get this email." Show the warning email.
4. **Free Agency (1:00)**
   "No team? Post as a free agent: data and slides." Show the Suggested matches panel with a matching team.
5. **Player Card and Standings (1:15)**
   "Results go on your Player Card, and clubs climb the standings." Show the standings page and a club stat.
6. **Close (1:25)**
   "Never miss a UTD competition, and never compete alone. That is Comet Arena."

## If something goes wrong

| Problem                       | Do this                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Extraction is slow            | Wait 8 seconds; the cached result appears for the signature flyer. Keep talking about the deadlines.  |
| Sign-in fails                 | Stay on The Field and Game Day; they are public. Show the Save flow from the screenshot in the deck.  |
| No signal                     | Open the deployed site from the saved PWA tab; The Field and Game Day pages are cached for 5 minutes. |
| Email does not arrive in time | Show the screenshot of the warning email you saved earlier.                                           |

## After the demo

- Ask officers to claim their page (Claim button on the club page) and offer to upload their results.
- Point students at the Comet Arena Weekly signup on the home page.
