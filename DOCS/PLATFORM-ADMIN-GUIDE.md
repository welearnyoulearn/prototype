# WLYL Platform Admin — User Guide
**Version 1 · June 2026 · Internal WLYL Team Only**

> This document is for the WLYL internal team. Do not share with school clients.

---

## Table of Contents

1. [Accessing the Platform Admin Portal](#1-accessing-the-platform-admin-portal)
2. [Dashboard — Schools Overview](#2-dashboard--schools-overview)
3. [Adding a New School](#3-adding-a-new-school)
4. [Managing Existing Schools](#4-managing-existing-schools)
5. [School Detail Page](#5-school-detail-page)
6. [Assigning & Changing Subscription Plans](#6-assigning--changing-subscription-plans)
7. [Feature Plan Configuration](#7-feature-plan-configuration)
8. [Platform Admin Team Management](#8-platform-admin-team-management)
9. [Audit Log](#9-audit-log)
10. [Common Scenarios & Workflows](#10-common-scenarios--workflows)

---

## 1. Accessing the Platform Admin Portal

### URL

`https://admin.welearnyoulearn.com`

### Login

Use your WLYL admin email and password. If this is your first time, a temporary password was sent to your email. Set a permanent password on first login.

> **Access is strictly internal.** This portal controls all schools and their subscription access. Do not share credentials or the URL with school clients.

---

## 2. Dashboard — Schools Overview

This is the first screen after login. It shows the health of the entire platform at a glance.

### 2.1 Summary Cards (top row)

**Active Schools**
- Total number of schools currently active on the platform.
- Growth this month: how many new schools joined.
- Breakdown badge: how many are inactive or soft-deleted.

**On Paid Plan**
- Total schools with any paid subscription (Basic + Standard + Premium).
- Percentage of active schools that are on a paid plan.
- Sub-breakdown: how many on Premium / Standard / Basic (colour-coded bar).
- This is your conversion metric — aim to maximise it.

**Platform Reach**
- Combined teachers + students across all active schools.
- Shows platform scale and growth over time.

**No Plan Yet**
- Schools that are active but have not been assigned any subscription tier.
- Shown in amber if the count is greater than 0 — these need follow-up.
- Click the card to instantly filter the table to "No Plan" schools.

### 2.2 Inactive Schools Banner

If any schools are inactive, an amber banner appears below the stat cards. Click it to view inactive schools.

### 2.3 Schools Table

The main table lists all schools. Default view shows **Active** schools.

**Columns:**
| Column | What it means |
|--------|---------------|
| School Name | Name of the school |
| City | Location |
| Plan | Subscription tier badge (No Plan, Basic, Standard, Premium) |
| Staff | Number of staff accounts in that school |
| Last Admin Login | When the school admin last logged in |
| Joined | Date the school was created in the platform |
| Status | Active / Inactive |

**Sorting:** Click any column header to sort ascending/descending.

**Tabs above the table:**
- **Active** — schools currently in use.
- **Inactive** — schools temporarily disabled.
- **Deleted** — soft-deleted schools (data preserved, can restore).

**Filters:**
- **Search box:** Type a school name, city, or school code.
- **Plan filter dropdown:** Filter by No Plan / Basic / Standard / Premium.
- **Clear Filters:** Resets search and plan filter.

---

## 3. Adding a New School

### Step 1 — Click "+ Add School"

The button is in the top-right of the dashboard.

### Step 2 — Fill In the School Form

| Field | Required? | Notes |
|-------|-----------|-------|
| School Name | Yes | Full legal name of the school |
| School Type | Yes | Private / Public / Charter / International |
| City | Yes | City where the school is located |
| Country | Yes | Default: India |
| Phone | No | School office phone number |
| Email | No | School's public email |
| Address | No | Full address |

### Step 3 — Submit

Click **Create School**. After a brief moment, a success modal appears showing:

- **School Code** (e.g., `SCH-042`) — the school admin uses this as their login ID.
- **Temporary Password** — the school admin uses this on first login and must change it.

> **Copy both immediately** using the copy buttons. You cannot retrieve the temporary password again. Paste them into an email or WhatsApp to send to the school contact.

### Step 4 — Assign a Plan (Important)

After creation the school is on "No Plan". Go to the school's detail page and assign a subscription tier immediately (see Section 6).

---

## 4. Managing Existing Schools

### Per-Row Actions (action buttons on each table row)

| Button | What it does |
|--------|-------------|
| View Details (→) | Opens the full school detail page |
| Change Plan | Quick dropdown to change the subscription tier in-place |
| Deactivate | Disables the school — admins can no longer log in |
| Reactivate | Re-enables a deactivated school |
| Delete | Soft-deletes the school (moves to Deleted tab, data preserved) |

### Quick Plan Change

Click the plan badge or the Change Plan button on a table row. A small modal appears with the 4 tier options. Select the new tier and save. The change is immediate — the school admin sees updated features on their next page load.

### Deactivating a School

Use this when a school's subscription has lapsed or there is a dispute. Deactivated schools:
- Cannot log in.
- Still have all their data preserved.
- Can be reactivated instantly when the situation is resolved.

### Deleting a School

Soft-delete moves the school to the **Deleted** tab. The school and all its data (students, staff, fees, attendance) remain in the database but are hidden from active views. This can be restored if needed.

> **There is no permanent hard-delete.** Data is always preserved. This is intentional for compliance and dispute resolution.

---

## 5. School Detail Page

Click **View Details** on any school to open its full detail page.

### 5.1 School Information Card

Shows: Name, Type, City, Country, Status, Plan badge, School ID, Teacher count, Student count, Created date.

**Edit mode:** Click the **Edit** button to change the school's name, type, location, or contact details. Click **Save** to confirm.

### 5.2 School Admin Account Card

| Field | What it means |
|-------|---------------|
| School Code | The login ID the school admin uses |
| Admin Email | Email on file for the school admin |
| Account Status | "Awaiting First Login" or "Active" |

**Reset Password button:**

Generates a new temporary password and emails it to the admin's email address on file. Use this when a school admin says they are locked out or forgot their password.

> After reset, the admin receives an email with the new temp password and must change it on their next login.

### 5.3 Subscription Plan Card

Shows the 4 tier options (No Plan, Basic, Standard, Premium) as selectable cards.

- The currently active plan is highlighted with a blue ring.
- Below each plan card, the features enabled for that plan are listed.
- Select the new plan, then click **Assign Plan**.
- A green confirmation message appears.

The change takes effect immediately — the school admin sees the updated feature set on their next login.

### 5.4 Danger Zone

A red section at the bottom with the **Delete this school** button. Requires a confirmation click. This performs a soft-delete (see Section 4).

---

## 6. Assigning & Changing Subscription Plans

### Plan Tiers and What They Include

The exact feature list per tier is controlled by you in the **Feature Plans** page (Section 7). The tiers themselves are:

| Tier | Typical Usage |
|------|---------------|
| **No Plan** | Newly created schools — can only log in, no features |
| **Basic** | Core features only — students, staff, attendance, timetable, exams, announcements |
| **Standard** | Basic + Fee Management + advanced academic features |
| **Premium** | Standard + Online Payments + WhatsApp reminders + analytics |

### When to Upgrade / Downgrade

**Upgrade scenario:** School pays for a higher plan → go to their detail page → select the new tier → Assign Plan.

**Downgrade scenario:** School's paid plan lapses or they move to a lower plan → same process. Note that features that exceed the new plan will be hidden immediately (data is preserved, just not visible).

**Trial / Demo:** You can assign any plan to a new school during an on-site demo. Revert to No Plan or Basic after the demo if they haven't subscribed.

---

## 7. Feature Plan Configuration

**Location:** Top navigation bar → Feature Plans (or go to `/platform-admin/features`)

This is where you control **exactly which features are included in each plan tier.** This is the most powerful page on the platform — changes here affect all schools on each tier simultaneously.

### 7.1 Understanding the Feature Matrix

The page shows a table with:
- **Rows:** Every feature in the platform (grouped by category).
- **Columns:** Basic | Standard | Premium.
- **Cells:** Checkboxes. Checked = feature is ON for that tier.

**Categories of features:**
- **Core** — Students, Staff, Class Management (always on for all tiers)
- **Academic** — Timetable, Attendance, Exam Schedule, Leave Requests, Emergency Cover
- **Finance** — Fee Management, Fee Reports, Amendment Log
- **Communication** — Announcements, WhatsApp
- **Analytics** — Detailed reports, Monthly trend, Defaulter analysis
- **Administration** — Export Centre, Audit Log, Year Rollover

### 7.2 How Tier Checkboxes Work

Each tier is **independent**. Checking Premium does NOT automatically check Basic or Standard.

**Example:**
- Fee Management: Basic ☐, Standard ✓, Premium ✓
  - Schools on Basic cannot see Fee Management.
  - Schools on Standard and Premium can.

- WhatsApp: Basic ☐, Standard ☐, Premium ✓
  - Only Premium schools see WhatsApp integration.

This gives you complete flexibility to create any tier combination.

### 7.3 Making Changes

1. Check or uncheck the boxes for each feature and tier.
2. The **Plan Summary Cards** at the top update in real-time showing "N of X features enabled" for each tier.
3. A badge next to each feature automatically updates (e.g., "Premium only", "Standard+", "Disabled").
4. When done, click **Save Plan Config**.
5. A confirmation modal appears: "Plan Config Saved! — N features for Basic, N for Standard, N for Premium."

> **Changes take effect immediately** for all schools the next time their admin loads the page. No redeployment needed.

### 7.4 Recommended Plan Configuration

This is the default setup — adjust as needed for your sales strategy:

| Feature | Basic | Standard | Premium |
|---------|-------|----------|---------|
| Student Management | ✓ | ✓ | ✓ |
| Staff Management | ✓ | ✓ | ✓ |
| Class Management | ✓ | ✓ | ✓ |
| Attendance | ✓ | ✓ | ✓ |
| Timetable | ✓ | ✓ | ✓ |
| Exam Schedule | ✓ | ✓ | ✓ |
| Announcements | ✓ | ✓ | ✓ |
| Leave Requests | ✓ | ✓ | ✓ |
| Emergency Cover | ✓ | ✓ | ✓ |
| Fee Management | ✗ | ✓ | ✓ |
| Fee Reports | ✗ | ✓ | ✓ |
| Export Centre | ✓ | ✓ | ✓ |
| Year Rollover | ✓ | ✓ | ✓ |
| Online Payments | ✗ | ✗ | ✓ |
| WhatsApp Reminders | ✗ | ✗ | ✓ |
| Advanced Analytics | ✗ | ✓ | ✓ |

---

## 8. Platform Admin Team Management

**Location:** Top navigation bar → Admin Team (👥 button)

Manage who on the WLYL internal team can access this platform admin portal.

### Viewing Current Admins

A modal opens showing all WLYL platform admins with:
- Full Name
- Email
- Status: "Active" or "Awaiting First Login"

### Adding a New Admin

1. Click **+ Add Admin**.
2. Enter Full Name and Email.
3. Submit.
4. A temporary password is sent to the new admin's email.
5. They must log in and set a new password before their session works.

### Managing Existing Admins

- **Reset Password:** Generates and emails a new temp password. Use when an admin is locked out.
- **Delete:** Removes admin access. The person can no longer log in.

> **Only give platform admin access to WLYL internal team members.** This account has access to every school's data.

---

## 9. Audit Log

**Location:** Top navigation bar → Audit Log

A chronological record of all significant actions taken in the platform admin portal.

**What is logged:**
- School created / deleted / reactivated
- Plan changed (by whom, old plan → new plan, timestamp)
- Feature matrix updated (by whom, what changed)
- Admin added / deleted
- Password resets

**Columns:** Timestamp, Admin Name, Action, Details, School (if applicable).

**Filters:** By date range, by admin, by action type.

**Export:** Download the audit log as CSV for compliance or billing records.

> **Review the audit log regularly**, especially after any school disputes about plan changes or access issues. The log is the source of truth.

---

## 10. Common Scenarios & Workflows

### Scenario 1 — School Visit (On-Site Demo)

**Before visiting:**
1. Create the school in the platform (Section 3).
2. Assign **Premium** plan so all features are visible during demo.
3. Copy the School Code and temporary password — you need these at the school.

**At the school:**
1. Open the school portal URL on your laptop or their computer.
2. Log in with the School Code and temp password.
3. Set a new password (school admin's choice or one you set and hand over).
4. Walk through the demo — use this School Admin Guide as your walkthrough script.

**After the visit:**
- If school subscribes: keep them on the agreed plan.
- If no subscription yet: downgrade to No Plan or Basic until they subscribe.
- Send the School Code, final password, and the School Admin Guide PDF to the school contact.

---

### Scenario 2 — School Asks to Upgrade to Premium

1. Log into the Platform Admin portal.
2. Find the school (search by name).
3. Click **View Details**.
4. In the Subscription Plan card, select **Premium**.
5. Click **Assign Plan**.
6. Confirm with the school that features now appear (they may need to refresh their browser).
7. Log the change in your CRM/billing system (WLYL does not handle billing automatically — this is manual).

---

### Scenario 3 — School Admin Locked Out

1. Go to the school's detail page.
2. Click **Reset Password** in the School Admin Account card.
3. A new temp password is sent to the admin's email on file.
4. Confirm with the school admin that they received the email.
5. They log in with the temp password and are forced to set a new one.

If the email on file is wrong, edit it first (click Edit on the School Information card), save, then reset the password.

---

### Scenario 4 — A School Wants a Feature That Is Not in Their Plan

Two options:

**Option A — Upgrade their plan:**
- Move them to a higher tier where the feature is included.
- This gives them all other features in that tier too.

**Option B — Custom feature configuration:**
- Go to Feature Plans and check the specific feature for their current tier.
- This gives the feature to ALL schools on that tier — use carefully.
- Better to upgrade the school if the feature is genuinely a higher-tier item.

---

### Scenario 5 — School Requests Their Data (Compliance / Audit)

1. Log into the platform admin portal.
2. Navigate to the school's detail page.
3. Note the School ID number (shown in the info card).
4. Coordinate with the technical team to export data for that school ID from the database.
5. Log the request in the Audit Log (or note it manually in your records).

---

### Scenario 6 — Rolling Out a New Feature to All Schools

1. Go to **Feature Plans**.
2. Add the new feature to the appropriate tiers by checking the boxes.
3. Click **Save Plan Config**.
4. All schools on those tiers will see the feature immediately on their next login — no redeployment needed.
5. Communicate the new feature to schools via your standard communication channel.

---

### Scenario 7 — Tracking Sales Pipeline (No Plan schools)

1. On the main dashboard, look at the **No Plan Yet** card.
2. Click it to filter the table to schools without a plan.
3. Review "Last Admin Login" column — if a school logged in recently, they are actively using the demo.
4. Contact those schools for sales follow-up.
5. When they subscribe, assign the appropriate plan.

---

*Document prepared for internal WLYL team use. Version 1 — June 2026.*
