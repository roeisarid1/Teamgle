# Teamgle — Claude Code Implementation Handoff

## What this is
This document tells Claude Code exactly how to apply the Teamgle visual redesign to the existing codebase (`roeisarid1/Teamgle`). The redesigned UI kit is at `ui_kits/teamgle-app/index-v2.html` — use it as the visual reference.

---

## Summary of Changes

| Area | Before | After |
|---|---|---|
| Fonts | Inter | Plus Jakarta Sans (weights 400/500/600/700/800) |
| Navbar | Blue background | White, sticky, with border-bottom |
| Logo | PNG img | Inline SVG (4-arrow icon + wordmark) |
| Sidebar active state | Blue bg only | Blue bg + 3px left-border indicator |
| Card style | Shadow only | Shadow + 1.5px border (#E5E8F2) |
| Button radius | 8px | 10px |
| Table row hover | #fafbff | #F5F7FF (blue-50) |
| Badge style | Simple | With colored dot prefix |
| Primary color | #5B7BF0 | #4F6EF7 |
| Background | #f4f6ff | #F6F8FD |
| Inputs | #fafafa bg | #F9FAFD bg, Plus Jakarta Sans font |
| Chat bubbles | Simple | Shadow, rounded, polished |

---

## Step-by-Step Instructions for Claude Code

### 1. Replace the font in all HTML files

In every `<head>` section, replace:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```
With:
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

And update the `body` font-family in all CSS files:
```css
/* BEFORE */
font-family: 'Inter', system-ui, sans-serif;

/* AFTER */
font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
```

---

### 2. Update CSS variables (all three CSS files)

Replace the `:root` block in `manager-dashboard.css` and `auth.css`:

```css
:root {
  --blue:        #4F6EF7;
  --blue-dark:   #3A56E8;
  --blue-light:  #EBF0FF;
  --blue-50:     #F5F7FF;
  --green:       #52B96A;
  --green-light: #E8F8EC;
  --yellow:      #F4B942;
  --red:         #EF4444;
  --red-light:   #FEF2F2;

  --text:        #111827;
  --text-muted:  #6B7280;
  --border:      #E5E8F2;
  --border-2:    #EEF0F8;
  --bg:          #F6F8FD;
  --card:        #FFFFFF;
  --surface:     #F9FAFD;
  --radius:      10px;
  --transition:  .16s ease;
}
```

---

### 3. Update the Navbar (`manager-dashboard.css`)

Replace the `.navbar` rule:

```css
/* REPLACE THIS */
.navbar {
  background: var(--blue);
  padding: 0 32px;
  height: 60px;
  ...
  box-shadow: 0 2px 12px rgba(91,123,240,.2);
}

/* WITH THIS */
.navbar {
  background: var(--card);
  padding: 0 24px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1.5px solid var(--border);
  box-shadow: none;
}
```

Change text/icon colors in `.navbar-user span`, `.btn-logout`:
```css
/* User name — was white, now dark */
.navbar-user span { color: var(--text-muted); font-size: 13px; }

/* Logout button — was white ghost, now subtle bordered */
.btn-logout {
  background: none;
  border: 1.5px solid var(--border);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.btn-logout:hover {
  border-color: var(--red);
  color: var(--red);
  background: var(--red-light);
}
```

Update navbar chip (was rgba white, now blue-tinted):
```css
.navbar-chip {
  background: var(--blue-50);
  border: 1px solid var(--blue-light);
  border-radius: 20px;
  padding: 4px 12px;
}
.chip-label { color: var(--text-muted); }
.chip-value { color: var(--blue); }
```

---

### 4. Update the Logo to SVG

In `manager-dashboard.html`, replace the `<img>` logo tag in `.navbar-brand`:

```html
<!-- REMOVE THIS -->
<img src="..." alt="Teamgle">

<!-- ADD THIS inline SVG + wordmark -->
<svg width="26" height="26" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <path id="arr" d="M18,1 L33,16 L24.5,16 L24.5,33 Q24.5,36 18,36 Q11.5,36 11.5,33 L11.5,16 L3,16 Z"/>
  </defs>
  <g transform="translate(0,0) rotate(-45,18,18)"><use href="#arr" fill="#4F6EF7"/></g>
  <g transform="translate(44,0) rotate(45,18,18)"><use href="#arr" fill="#2BB59A"/></g>
  <g transform="translate(0,44) rotate(-135,18,18)"><use href="#arr" fill="#52B96A"/></g>
  <g transform="translate(44,44) rotate(135,18,18)"><use href="#arr" fill="#F4B942"/></g>
</svg>
<span style="font-size:18px;font-weight:800;color:#4F6EF7;letter-spacing:-.3px">Teamgle</span>
```

Do the same replacement in `auth.html` for the logo in `.logo-wrap`.

---

### 5. Sidebar active state

Add a `::before` pseudo-element for the active nav item:

```css
/* Add to existing .nav-item.active rule */
.nav-item.active {
  background: var(--blue-light);
  color: var(--blue);
  font-weight: 600;
  position: relative;  /* ADD */
}

/* ADD this new rule */
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--blue);
  border-radius: 0 3px 3px 0;
}
```

---

### 6. Section cards — add border

```css
/* BEFORE */
.section-card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  overflow: hidden;
}

/* AFTER — add border */
.section-card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(79,110,247,.08), 0 1px 3px rgba(0,0,0,.05);
  border: 1.5px solid #EEF0F8;
  overflow: hidden;
}
```

---

### 7. Badge style — add colored dot

```css
/* Replace badge rules */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 600;
}
.badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.badge-active  { background: #E8F8EC; color: #166534; }
.badge-active::before  { background: #52B96A; }
.badge-pending { background: #FEF5E0; color: #92400E; }
.badge-pending::before { background: #F4B942; }
```

---

### 8. Table improvements

```css
/* Updated table header */
thead th {
  background: var(--surface);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  color: var(--text-muted);
  border-bottom: 1.5px solid #EEF0F8;
}

/* Updated row hover */
tbody tr:hover { background: var(--blue-50); }

/* Stronger name cells */
/* Add .fw-700 class to name cells in JS or HTML, or use :first-of-type if possible */
```

---

### 9. Modal backdrop blur

```css
/* Add backdrop-filter to modal overlay */
.modal-overlay.open {
  display: flex;
  backdrop-filter: blur(2px);
}

/* Upgrade modal border */
.modal {
  border: 1.5px solid #EEF0F8;
  border-radius: 18px;
}
```

---

### 10. Chat improvements

```css
/* Outgoing bubble — blue with shadow */
.bubble.sent, .bubble-out {
  background: var(--blue);
  color: #fff;
  box-shadow: 0 2px 8px rgba(79,110,247,.25);
}

/* Active conversation — left indicator */
.conv-item.active {
  background: var(--blue-50);
  position: relative;
}
.conv-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--blue);
}
```

---

## File Checklist

- [ ] `frontend/css/auth.css` — update `:root` tokens, font, button styles
- [ ] `frontend/css/manager-dashboard.css` — update `:root`, navbar, sidebar, cards, table, badges, modal
- [ ] `frontend/css/chat.css` — update bubble colors, conv active state
- [ ] `frontend/auth.html` — replace logo img with inline SVG, update font link
- [ ] `frontend/manager-dashboard.html` — replace logo, update font link
- [ ] `frontend/employee-dashboard.html` — update font link

## Reference File
Open `ui_kits/teamgle-app/index-v2.html` to see the target visual output at any point.
