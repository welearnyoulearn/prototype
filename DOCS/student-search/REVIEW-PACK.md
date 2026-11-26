# Student Search: review pack (#538)

For the three decisions that block real students. Written by engineering; **not legal advice**.
Mark each answer, name and date here or on issue #538.

## What the feature does today

- A parent turns it on for their child. The school must also have the feature on.
- The student types a search. Our server checks consent and a word list, saves the words, then the browser sends
  them to Google (results and ads) and, for a card, to Wikipedia (summary and pictures, with facts from
  Wikidata) or Wiktionary (word meaning). Sums are
  worked out in the browser. No AI.
- We keep the words, a label and the time for 30 days. The parent sees and can delete them. No alerts are sent.
- If the AI Tutor fails on a question of 200 characters or less, the portal searches for it the same way.
- Optional, off by default and separately agreed: a button that opens Google’s own page with the search words. The
  tap is shown to the parent; nothing on Google’s page is visible to us.
- Stopped searches are not sent to Google, Wikipedia or Wiktionary. Personal details are not saved.

## 1. Lawyer

Read: [Digital Personal Data Protection Act, 2023](https://prsindia.org/files/bills_acts/bills_parliament/2023/Digital_Personal_Data_Protection_Act,_2023.pdf)
sections 2(f), 5, 6, 8, 9 and the DPDP Rules, 2025.

| # | Question | Answer |
|---|---|---|
| 1 | Who is the Data Fiduciary: the school, WLYL or both? | |
| 2 | Section 9(3) bans tracking, behavioural monitoring and targeted advertising for children. Is saving searches for parents allowed? Does any school exemption cover WLYL acting for a school? | |
| 3 | The basic Google box shows ads and its ad requests carry the search words. Can it be used at all with children? What must Google confirm in writing? | |
| 4 | Today consent is a tick box by a signed-in parent. Is that "verifiable consent"? What check of identity and relationship is needed? | |
| 5 | Is the notice on the parent screen sufficient, or must the full notice be shown? Which languages? | |
| 6 | Either linked parent can change the decision; the newest one counts. Is that acceptable? | |
| 7 | Is 30 days right for keeping searches? How long must consent records be kept? | |
| 8 | Is showing our own cards (Wikipedia, Wiktionary, maths) above Google's results allowed by [Google's terms](https://support.google.com/programmable-search/answer/1714300)? | |
| 9 | From which date must all of this be in place? (Secondary sources say 13 May 2027 for the children's rules.) | |

Reviewer: ______________  Date: ______________  Decision: approve / change / do not launch

## 2. School counsellor

Shown to the student for self-harm wording:

> **You are not alone.** It sounds like something may be hurting. Please talk to a parent, teacher or another adult
> you trust today. You can also call Childline on 1098, or Tele-MANAS on 14416 (free, in India). If you are in danger
> now, call 112.

| # | Question | Answer |
|---|---|---|
| 1 | Are the wording and the three numbers right? Check the numbers are current. | |
| 2 | The parent sees the search marked "May need your support". When could that put a child at risk? | |
| 3 | Should a counsellor be told too? Who, and how quickly? (Not built: nobody is alerted today.) | |
| 4 | Should the message also be in Telugu and Hindi? (It is English only today.) | |
| 5 | Are any phrases missing or wrong in the list below? | |

Phrases are in [`lib/studentSearch/safety.ts`](../../lib/studentSearch/safety.ts). A **native Telugu speaker and a
native Hindi speaker** must check them, including how students really type in English letters. The list cannot
catch indirect wording.

Reviewer: ______________  Date: ______________

## 3. Ads

| Route | What to do | Open point |
|---|---|---|
| Google for Education (for a school) | A school registers, then asks for ad-free search | Probably covers the school's own website; ask whether it covers a WLYL portal |
| Google for Nonprofits | Only if an eligible nonprofit owns the site | WLYL's eligibility is unknown |
| Paid ad-free option | Ask Google for the product and price | Google's page mentions it without a price |

Source: [Google's page for nonprofits and schools](https://support.google.com/programmable-search/answer/12423873).
Do not hide ads with code: Google's terms require displaying them.

Message to send Google:

> We run a school portal in India used by students under 18. We use Programmable Search Engine (search engine ID in
> our account). We need: (1) results without ads; (2) written confirmation of what data Google collects from these
> searches, whether any is used for advertising or profiling, and how it is handled for children; (3) whether a
> platform provider acting for schools is eligible for the education offer; (4) the price if it is not.
