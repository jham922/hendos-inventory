# Vendor Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vendors section to the Admin tab that lets admins add new vendors and rename existing ones, with vendors persisted in Supabase and referenced dynamically across the app.

**Architecture:** A new `vendors` Supabase table stores vendor names. On app start, `loadVendors()` fetches this table and populates a `vendors` state array with a hardcoded fallback. All places that previously hardcoded the three vendor names (chips, select dropdown, badge function, setVendor loop) are rewritten to iterate `vendors` dynamically. The Admin tab gains a Vendor section below the items table with inline add/rename UI.

**Tech Stack:** Vanilla JS + HTML in `index.html`, Supabase REST API via `sbFetch()`, Supabase MCP for DB migrations.

---

## File Map

| File | Changes |
|---|---|
| `index.html` | All changes — CSS, HTML, and JS are co-located in this single file |

---

### Task 1: Create the `vendors` table in Supabase and seed it

**Files:**
- Modify: Supabase DB (via MCP tool)

- [ ] **Step 1: Run the migration via Supabase MCP**

Use the `mcp__claude_ai_Supabase__execute_sql` tool with project ID `codzcyqavknpddhumtgx` and this SQL:

```sql
-- Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Seed with existing vendors
INSERT INTO vendors (name) VALUES
  ('Southern'),
  ('Gate City'),
  ('Chef Orders')
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 2: Verify the table and rows exist**

Run this SQL via `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT name FROM vendors ORDER BY created_at;
```

Expected output: 3 rows — Southern, Gate City, Chef Orders.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: create vendors table in Supabase with seed data"
```

---

### Task 2: Add `vendors` state variable and `loadVendors()` function

**Files:**
- Modify: `index.html` (STATE section ~line 881, after startApp ~line 1676)

- [ ] **Step 1: Add `vendors` state variable**

Find this block (around line 881):

```js
let items = [];
let activeFilters = { low: false, out: false };
let activeCategory = 'all';
let activeVendor = 'all';
```

Replace with:

```js
let items = [];
let vendors = [];
let activeFilters = { low: false, out: false };
let activeCategory = 'all';
let activeVendor = 'all';
```

- [ ] **Step 2: Add `loadVendors()` function**

Find this comment (around line 1544):

```js
// On load, also pull any custom items from Supabase inventory_items table
async function loadCustomItems() {
```

Insert the following block immediately before that line:

```js
const FALLBACK_VENDORS = ['Southern', 'Gate City', 'Chef Orders'];

async function loadVendors() {
  try {
    const rows = await sbFetch('/rest/v1/vendors?select=name&order=created_at.asc');
    vendors = rows.map(r => r.name);
    if (!vendors.length) vendors = [...FALLBACK_VENDORS];
  } catch(e) {
    console.warn('Could not load vendors, using fallback:', e);
    vendors = [...FALLBACK_VENDORS];
  }
}
```

- [ ] **Step 3: Call `loadVendors()` in `startApp()` before `loadCustomItems()`**

Find this block inside `startApp()` (around line 1675):

```js
  (async () => {
    await loadCustomItems();
    await loadState();
  })();
```

Replace with:

```js
  (async () => {
    await loadVendors();
    await loadCustomItems();
    await loadState();
  })();
```

- [ ] **Step 4: Verify manually**

Open the app and log in. Open the browser console and type `vendors` — it should print the array `['Southern', 'Gate City', 'Chef Orders']`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add vendors state + loadVendors() with Supabase fetch and fallback"
```

---

### Task 3: Refactor `vendorBadge()` and consolidate CSS badge classes

**Files:**
- Modify: `index.html` (CSS ~line 181, JS ~line 1215)

- [ ] **Step 1: Replace the four per-vendor CSS classes with one generic class**

Find these four lines (around line 181):

```css
  .vendor-southern { display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:rgba(212,130,42,0.15);color:#d4822a; }
  .vendor-gate { display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:rgba(74,158,107,0.15);color:#4a9e6b; }
  .vendor-chef { display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:rgba(104,90,200,0.15);color:#a090e0; }
  .vendor-none { display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:rgba(90,82,73,0.15);color:#5a5249; }
```

Replace with:

```css
  .vendor-badge { display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:rgba(212,130,42,0.15);color:#d4822a; }
  .vendor-none  { display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:rgba(90,82,73,0.15);color:#5a5249; }
```

- [ ] **Step 2: Rewrite `vendorBadge()` to use the single class**

Find this function (around line 1215):

```js
function vendorBadge(vendor) {
  if (!vendor || vendor === '—') return '<span class="vendor-none">—</span>';
  if (vendor === 'Southern') return '<span class="vendor-southern">Southern</span>';
  if (vendor === 'Gate City') return '<span class="vendor-gate">Gate City</span>';
  if (vendor === 'Chef Orders') return '<span class="vendor-chef">Chef Orders</span>';
  return `<span class="vendor-none">${vendor}</span>`;
}
```

Replace with:

```js
function vendorBadge(vendor) {
  if (!vendor || vendor === '—') return '<span class="vendor-none">—</span>';
  return `<span class="vendor-badge">${vendor}</span>`;
}
```

- [ ] **Step 3: Verify manually**

Open the app, log in, and go to the Inventory tab. Vendor badges should appear in amber/gold on all items. Go to the Admin tab — vendor column should show amber badges.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor: consolidate vendor badge CSS to single generic class"
```

---

### Task 4: Make vendor filter chips dynamic

**Files:**
- Modify: `index.html` (HTML ~line 508, JS ~line 1087)

- [ ] **Step 1: Remove the hardcoded vendor chips from HTML**

Find these three lines (around line 508):

```html
    <div class="chip" id="chip-Southern" onclick="setVendor('Southern')">🟠 Southern</div>
    <div class="chip" id="chip-Gate City" onclick="setVendor('Gate City')">🟢 Gate City</div>
    <div class="chip" id="chip-Chef Orders" onclick="setVendor('Chef Orders')">🟣 Chef Orders</div>
```

Replace with an empty container div:

```html
    <div id="vendorChips"></div>
```

- [ ] **Step 2: Add `renderVendorChips()` function**

Find the `setVendor` function (around line 1087):

```js
function setVendor(v) {
  activeVendor = activeVendor === v ? 'all' : v;
  ['Southern','Gate City','Chef Orders'].forEach(vn => {
    const c = document.getElementById('chip-' + vn);
    if (c) c.classList.toggle('active', activeVendor === vn);
  });
  renderInventory();
}
```

Replace with:

```js
function renderVendorChips() {
  const container = document.getElementById('vendorChips');
  if (!container) return;
  container.innerHTML = vendors.map(vn =>
    `<div class="chip" id="chip-${CSS.escape(vn)}" onclick="setVendor('${vn.replace(/'/g, "\\'")}')">${vn}</div>`
  ).join('');
  // Restore active state if a vendor filter is set
  vendors.forEach(vn => {
    const c = document.getElementById('chip-' + CSS.escape(vn));
    if (c) c.classList.toggle('active', activeVendor === vn);
  });
}

function setVendor(v) {
  activeVendor = activeVendor === v ? 'all' : v;
  vendors.forEach(vn => {
    const c = document.getElementById('chip-' + CSS.escape(vn));
    if (c) c.classList.toggle('active', activeVendor === vn);
  });
  renderInventory();
}
```

- [ ] **Step 3: Call `renderVendorChips()` after vendors load**

Find the `loadVendors()` function added in Task 2 and add a call to `renderVendorChips()` at the end:

```js
async function loadVendors() {
  try {
    const rows = await sbFetch('/rest/v1/vendors?select=name&order=created_at.asc');
    vendors = rows.map(r => r.name);
    if (!vendors.length) vendors = [...FALLBACK_VENDORS];
  } catch(e) {
    console.warn('Could not load vendors, using fallback:', e);
    vendors = [...FALLBACK_VENDORS];
  }
  renderVendorChips();
}
```

- [ ] **Step 4: Verify manually**

Open the app and log in. The Inventory tab chip row should show Southern, Gate City, Chef Orders as tappable filter chips. Clicking each should filter the list and highlight the chip.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: render vendor filter chips dynamically from vendors state"
```

---

### Task 5: Make the item modal vendor `<select>` dynamic

**Files:**
- Modify: `index.html` (HTML ~line 583, JS ~line 1462 and ~line 1480)

- [ ] **Step 1: Remove the hardcoded `<option>` elements from the vendor select**

Find this block (around line 583):

```html
        <select id="editVendor" class="filter-btn" style="width:100%;appearance:none;-webkit-appearance:none;background-color:var(--bg)">
          <option value="Southern">Southern</option>
          <option value="Gate City">Gate City</option>
          <option value="Chef Orders">Chef Orders</option>
          <option value="—">Unassigned</option>
        </select>
```

Replace with (empty select — options populated by JS):

```html
        <select id="editVendor" class="filter-btn" style="width:100%;appearance:none;-webkit-appearance:none;background-color:var(--bg)">
        </select>
```

- [ ] **Step 2: Add `populateVendorSelect()` helper**

Add this function directly after the `renderVendorChips()` function added in Task 4:

```js
function populateVendorSelect(selectedValue) {
  const sel = document.getElementById('editVendor');
  if (!sel) return;
  sel.innerHTML = vendors.map(v =>
    `<option value="${v}"${v === selectedValue ? ' selected' : ''}>${v}</option>`
  ).join('') + `<option value="—"${selectedValue === '—' ? ' selected' : ''}>Unassigned</option>`;
}
```

- [ ] **Step 3: Call `populateVendorSelect()` in `showAddItem()`**

Find `showAddItem()` (around line 1462):

```js
function showAddItem() {
  document.getElementById('modalTitle').textContent = 'Add Item';
  document.getElementById('editItemId').value = '';
  document.getElementById('editName').value = '';
  document.getElementById('editCategory').value = 'Spirits';
  document.getElementById('editVendor').value = 'Southern';
  document.getElementById('editPar').value = '';
  document.getElementById('modalError').textContent = '';
  document.getElementById('itemModal').style.display = 'flex';
}
```

Replace with:

```js
function showAddItem() {
  document.getElementById('modalTitle').textContent = 'Add Item';
  document.getElementById('editItemId').value = '';
  document.getElementById('editName').value = '';
  document.getElementById('editCategory').value = 'Spirits';
  populateVendorSelect(vendors[0] || '—');
  document.getElementById('editPar').value = '';
  document.getElementById('modalError').textContent = '';
  document.getElementById('itemModal').style.display = 'flex';
}
```

- [ ] **Step 4: Call `populateVendorSelect()` in `editItem()`**

Find `editItem()` (around line 1473):

```js
function editItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('modalTitle').textContent = 'Edit Item';
  document.getElementById('editItemId').value = id;
  document.getElementById('editName').value = item.name;
  document.getElementById('editCategory').value = item.category;
  document.getElementById('editVendor').value = item.vendor || '—';
  document.getElementById('editPar').value = item.par;
  document.getElementById('modalError').textContent = '';
  document.getElementById('itemModal').style.display = 'flex';
}
```

Replace with:

```js
function editItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('modalTitle').textContent = 'Edit Item';
  document.getElementById('editItemId').value = id;
  document.getElementById('editName').value = item.name;
  document.getElementById('editCategory').value = item.category;
  populateVendorSelect(item.vendor || '—');
  document.getElementById('editPar').value = item.par;
  document.getElementById('modalError').textContent = '';
  document.getElementById('itemModal').style.display = 'flex';
}
```

- [ ] **Step 5: Verify manually**

Open the app, log in, go to Admin, click "+ Add Item". The Vendor dropdown should show Southern, Gate City, Chef Orders, Unassigned. Click Edit on any item — the correct vendor should be pre-selected.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: populate item modal vendor select dynamically from vendors state"
```

---

### Task 6: Add vendor management HTML section to Admin tab

**Files:**
- Modify: `index.html` (HTML ~line 559, inside `#adminPanel`)

- [ ] **Step 1: Add the vendor section HTML below `#adminTableWrap`**

Find this line (around line 559):

```html
    <div id="adminTableWrap"></div>
  </div>
```

Replace with:

```html
    <div id="adminTableWrap"></div>

    <!-- VENDOR MANAGEMENT SECTION -->
    <div style="margin-top:28px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:12px">Vendors</div>
      <div style="margin-bottom:10px">
        <button class="action-btn" onclick="showAddVendorForm()" id="addVendorBtn" style="font-size:13px;padding:7px 16px">+ Add Vendor</button>
      </div>
      <div id="addVendorForm" style="display:none;margin-bottom:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="newVendorInput" class="search-input" placeholder="Vendor name" style="padding-left:14px;max-width:240px" oninput="validateNewVendorInput()">
          <button class="action-btn" id="saveNewVendorBtn" onclick="saveNewVendor()" style="font-size:13px;padding:7px 16px" disabled>Save</button>
          <button class="filter-btn" onclick="hideAddVendorForm()" style="font-size:13px">Cancel</button>
        </div>
        <div id="addVendorError" style="color:var(--red);font-size:12px;margin-top:6px"></div>
      </div>
      <div id="vendorListWrap"></div>
    </div>
  </div>
```

- [ ] **Step 2: Verify HTML structure renders without errors**

Open the app and log in as admin. Go to the Admin tab and scroll down. You should see a "Vendors" section heading and a "+ Add Vendor" button. No JS errors in the console.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add vendor management HTML section to admin tab"
```

---

### Task 7: Implement `renderVendorList()` and wire it into the admin flow

**Files:**
- Modify: `index.html` (JS ADMIN section ~line 1424)

- [ ] **Step 1: Add `renderVendorList()` function**

Find this comment (around line 1424):

```js
// ============================================================
// ADMIN
// ============================================================
```

Add the following block immediately after that comment (before `renderAdminTable`):

```js
function renderVendorList() {
  const wrap = document.getElementById('vendorListWrap');
  if (!wrap) return;
  if (!vendors.length) {
    wrap.innerHTML = '<div style="color:var(--text-dim);font-size:13px">No vendors found.</div>';
    return;
  }
  wrap.innerHTML = vendors.map((v, i) => `
    <div class="vendor-mgmt-row" id="vendor-row-${i}" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--border);background:var(--surface);${i===0?'border-radius:8px 8px 0 0':''}${i===vendors.length-1?';border-radius:0 0 8px 8px;border-bottom:none':''}">
      <span id="vendor-name-${i}" style="font-size:13px;font-weight:500">${v}</span>
      <div id="vendor-view-${i}" style="display:flex;gap:6px">
        <button class="edit-btn" onclick="showRenameVendorForm(${i})">Rename</button>
      </div>
      <div id="vendor-edit-${i}" style="display:none;flex:1;margin-left:12px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="rename-input-${i}" class="search-input" value="${v}" style="padding-left:14px;max-width:200px" oninput="validateRenameInput(${i})">
          <button class="action-btn" id="rename-save-btn-${i}" onclick="saveRenameVendor(${i}, '${v.replace(/'/g, "\\'")}')" style="font-size:12px;padding:6px 12px">Save</button>
          <button class="filter-btn" onclick="hideRenameVendorForm(${i})" style="font-size:12px">Cancel</button>
        </div>
        <div id="rename-error-${i}" style="color:var(--red);font-size:12px;margin-top:6px"></div>
      </div>
    </div>
  `).join('');
}
```

- [ ] **Step 2: Call `renderVendorList()` inside `loadVendors()` after `renderVendorChips()`**

Find the updated `loadVendors()` from Task 4:

```js
  renderVendorChips();
}
```

Replace that last line with:

```js
  renderVendorChips();
  renderVendorList();
}
```

- [ ] **Step 3: Verify manually**

Log in as admin and go to the Admin tab. Scroll down — the Vendors section should list Southern, Gate City, Chef Orders, each with a "Rename" button.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: render vendor list in admin tab from vendors state"
```

---

### Task 8: Implement Add Vendor functionality

**Files:**
- Modify: `index.html` (JS ADMIN section)

- [ ] **Step 1: Add the add-vendor JS functions**

Add the following block immediately after `renderVendorList()`:

```js
function showAddVendorForm() {
  document.getElementById('addVendorForm').style.display = '';
  document.getElementById('newVendorInput').value = '';
  document.getElementById('addVendorError').textContent = '';
  document.getElementById('saveNewVendorBtn').disabled = true;
  document.getElementById('addVendorBtn').style.display = 'none';
  document.getElementById('newVendorInput').focus();
}

function hideAddVendorForm() {
  document.getElementById('addVendorForm').style.display = 'none';
  document.getElementById('addVendorBtn').style.display = '';
}

function validateNewVendorInput() {
  const val = document.getElementById('newVendorInput').value.trim();
  document.getElementById('saveNewVendorBtn').disabled = !val;
  document.getElementById('addVendorError').textContent = '';
}

async function saveNewVendor() {
  const name = document.getElementById('newVendorInput').value.trim();
  const errEl = document.getElementById('addVendorError');
  if (!name) return;

  if (vendors.map(v => v.toLowerCase()).includes(name.toLowerCase())) {
    errEl.textContent = 'A vendor with that name already exists';
    return;
  }

  const btn = document.getElementById('saveNewVendorBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await sbFetch('/rest/v1/vendors', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name })
    });
    vendors.push(name);
    hideAddVendorForm();
    renderVendorChips();
    renderVendorList();
    populateVendorSelect(document.getElementById('editVendor')?.value || vendors[0]);
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
```

- [ ] **Step 2: Verify manually — happy path**

Log in as admin, go to Admin tab, scroll to Vendors. Click "+ Add Vendor", type "Test Vendor", click Save. The vendor should appear in the list and the "+ Add Vendor" button should reappear.

- [ ] **Step 3: Verify manually — duplicate rejection**

Click "+ Add Vendor", type "Southern", click Save. An inline error "A vendor with that name already exists" should appear and nothing should be saved.

- [ ] **Step 4: Verify manually — empty name blocked**

Click "+ Add Vendor", leave the input blank. The Save button should be disabled (grayed out, unclickable).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add vendor — form, validation, Supabase save, and state update"
```

---

### Task 9: Implement Rename Vendor functionality

**Files:**
- Modify: `index.html` (JS ADMIN section)

- [ ] **Step 1: Add the rename-vendor JS functions**

Add the following block immediately after the add-vendor functions from Task 8:

```js
function showRenameVendorForm(index) {
  // Hide any other open rename form first
  vendors.forEach((_, i) => {
    if (i !== index) hideRenameVendorForm(i);
  });
  document.getElementById('vendor-view-' + index).style.display = 'none';
  document.getElementById('vendor-edit-' + index).style.display = 'flex';
  document.getElementById('rename-error-' + index).textContent = '';
  const input = document.getElementById('rename-input-' + index);
  input.focus();
  input.select();
}

function hideRenameVendorForm(index) {
  const viewEl = document.getElementById('vendor-view-' + index);
  const editEl = document.getElementById('vendor-edit-' + index);
  if (!viewEl || !editEl) return;
  viewEl.style.display = 'flex';
  editEl.style.display = 'none';
}

function validateRenameInput(index) {
  const val = document.getElementById('rename-input-' + index).value.trim();
  document.getElementById('rename-save-btn-' + index).disabled = !val;
  document.getElementById('rename-error-' + index).textContent = '';
}

async function saveRenameVendor(index, oldName) {
  const newName = document.getElementById('rename-input-' + index).value.trim();
  const errEl = document.getElementById('rename-error-' + index);
  if (!newName) return;

  if (newName === oldName) {
    hideRenameVendorForm(index);
    return;
  }

  if (vendors.map(v => v.toLowerCase()).includes(newName.toLowerCase())) {
    errEl.textContent = 'A vendor with that name already exists';
    return;
  }

  const btn = document.getElementById('rename-save-btn-' + index);
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // 1. Rename in vendors table
    await sbFetch('/rest/v1/vendors?name=eq.' + encodeURIComponent(oldName), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name: newName })
    });
    // 2. Cascade to inventory_items
    await sbFetch('/rest/v1/inventory_items?vendor=eq.' + encodeURIComponent(oldName), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ vendor: newName })
    });
    // 3. Update in-memory state
    vendors[index] = newName;
    items.forEach(item => {
      if (item.vendor === oldName) item.vendor = newName;
    });
    // 4. If the active vendor filter was the old name, update it
    if (activeVendor === oldName) activeVendor = newName;
    // 5. Re-render
    renderVendorChips();
    renderVendorList();
    renderAdminTable();
    renderInventory();
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
```

- [ ] **Step 2: Verify manually — happy path**

Log in as admin, go to Admin tab, Vendors section. Click "Rename" on "Gate City", type "Gate City Beverages", click Save. The list should update, and items previously assigned to "Gate City" should now show "Gate City Beverages" in the items table and on the Inventory tab.

- [ ] **Step 3: Verify manually — no-op rename**

Click "Rename", leave the name unchanged, click Save. The form should close without making any network call. No error shown.

- [ ] **Step 4: Verify manually — duplicate rejection**

Click "Rename" on any vendor, type the name of a different existing vendor, click Save. Should show "A vendor with that name already exists".

- [ ] **Step 5: Verify that only one rename form is open at a time**

Click "Rename" on Southern, then click "Rename" on Gate City. Only the Gate City form should be visible; Southern's should have closed.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: rename vendor — inline form, cascade to inventory_items, in-memory update"
```

---

## Self-Review Checklist

- [x] Supabase table created and seeded (Task 1)
- [x] `vendors` state + `loadVendors()` with fallback (Task 2)
- [x] All hardcoded badge CSS classes consolidated (Task 3)
- [x] Vendor filter chips rendered dynamically (Task 4)
- [x] Item modal vendor select populated dynamically (Task 5)
- [x] Vendor management HTML section in Admin tab (Task 6)
- [x] Vendor list renders from `vendors` state (Task 7)
- [x] Add vendor: form, validation, duplicate check, Supabase save, state update (Task 8)
- [x] Rename vendor: inline form, cascade update, in-memory patch, re-render (Task 9)
- [x] Empty name: Save button disabled client-side (Tasks 8 + 9)
- [x] Vendor section only visible to admins — already gated by `userRole === 'admin'` via the Admin tab
