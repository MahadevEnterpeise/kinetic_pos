<template>
  <div class="expense-manager">
    <!-- Top Summary Strip (reflects currently filtered/visible expenses) -->
    <div class="summary-bar">
      <div class="summary-card">
        <span class="summary-label">Total Logged</span>
        <span class="summary-value">LKR {{ formatMoney(totalSpent) }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Paid Outflow</span>
        <span class="summary-value paid-text">LKR {{ formatMoney(totalPaid) }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Pending Bills</span>
        <span class="summary-value pending-text">LKR {{ formatMoney(totalPending) }}</span>
      </div>
    </div>

    <!-- Top Search & Day Filter Bar -->
    <div class="filter-bar">
      <div class="search-group">
        <input
          v-model.trim="searchQuery"
          type="text"
          class="filter-input search-input"
          placeholder="Search by category, who (staff/user), item, or vendor..."
        />
      </div>

      <div class="filter-controls">
        <select v-model="selectedCategory" class="filter-select">
          <option value="ALL">All Categories</option>
          <option v-for="cat in categories" :key="cat" :value="cat">
            {{ cat }}
          </option>
        </select>

        <input
          v-model="selectedDate"
          type="date"
          class="filter-input date-filter"
          title="Filter by specific day"
        />

        <button
          v-if="hasActiveFilters"
          type="button"
          class="btn-clear"
          @click="clearFilters"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Scrollable Table Wrapper (keeps thead & NEW row accessible while scrolling past expenses) -->
    <div class="table-wrapper">
      <table class="expense-table">
        <thead>
          <tr>
            <th>ID & Day</th>
            <th>Category & Type</th>
            <th>Item / Who</th>
            <th>Vendor / Ref</th>
            <th class="col-qty">Qty & Unit</th>
            <th class="col-amount">Amount (LKR)</th>
            <th class="col-method">Payment Method</th>
            <th class="col-status">Status</th>
            <th class="col-action">Action</th>
          </tr>
        </thead>

        <tbody>
          <!-- Ordered: Today first, Yesterday second, older days descending -->
          <tr
            v-for="item in sortedFilteredExpenses"
            :key="item.id"
            :class="{ 'row-pending': item.status === 'Pending' }"
          >
            <td data-label="ID & Day">
              <div class="id-badge">{{ item.id }}</div>
              <div class="day-label" :class="getDayClass(item.date)">
                {{ getDayLabel(item.date) }}
              </div>
              <div class="sub-text">{{ item.date }}</div>
            </td>

            <td data-label="Category">
              <div class="fw-600">{{ item.category }}</div>
              <span class="type-pill" :class="item.costType.toLowerCase()">
                {{ item.costType }}
              </span>
            </td>

            <td data-label="Item / Who">
              <div class="fw-500">{{ item.item }}</div>
              <div class="sub-text">By: {{ item.recordedBy }}</div>
            </td>

            <td data-label="Vendor / Ref">
              <div>{{ item.vendor }}</div>
              <div class="sub-text">{{ item.refNo || '—' }}</div>
            </td>

            <!-- Editable Qty -->
            <td data-label="Qty & Unit" class="col-qty">
              <input
                v-model="item.qtyUnit"
                type="text"
                class="cell-input"
                placeholder="e.g. 5 kg"
              />
            </td>

            <!-- Editable Amount -->
            <td data-label="Amount (LKR)" class="col-amount">
              <input
                v-model.number="item.amount"
                type="number"
                min="0"
                step="0.01"
                class="cell-input amount-input"
              />
            </td>

            <!-- Editable Payment Method -->
            <td data-label="Payment Method" class="col-method">
              <select v-model="item.paymentMethod" class="cell-select">
                <option v-for="method in paymentMethods" :key="method" :value="method">
                  {{ method }}
                </option>
              </select>
            </td>

            <!-- Editable Status -->
            <td data-label="Status" class="col-status">
              <select
                v-model="item.status"
                class="cell-select status-select"
                :class="item.status.toLowerCase()"
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
              </select>
            </td>

            <!-- Delete Action -->
            <td data-label="Action" class="col-action">
              <button
                type="button"
                class="btn-icon btn-delete"
                title="Remove row"
                @click="removeExpense(item.id)"
              >
                ✕
              </button>
            </td>
          </tr>

          <!-- Always-Visible Empty Row to Add New Expense ("who" is assigned by backend when connected) -->
          <tr class="new-entry-row">
            <td data-label="Date">
              <div class="new-badge">NEW</div>
              <input v-model="newEntry.date" type="date" class="cell-input date-input" />
            </td>

            <td data-label="Category & Type">
              <select v-model="newEntry.category" class="cell-select mb-4">
                <option v-for="cat in categories" :key="cat" :value="cat">
                  {{ cat }}
                </option>
              </select>
              <select v-model="newEntry.costType" class="cell-select sub-select">
                <option value="Variable">Variable</option>
                <option value="Fixed">Fixed</option>
              </select>
            </td>

            <td data-label="Item / Description">
              <input
                v-model.trim="newEntry.item"
                type="text"
                class="cell-input"
                placeholder="Item description *"
                @keyup.enter="addExpense"
              />
            </td>

            <td data-label="Vendor / Ref">
              <input
                v-model.trim="newEntry.vendor"
                type="text"
                class="cell-input mb-4"
                placeholder="Vendor name"
              />
              <input
                v-model.trim="newEntry.refNo"
                type="text"
                class="cell-input sub-input"
                placeholder="Receipt / Ref #"
              />
            </td>

            <td data-label="Qty & Unit" class="col-qty">
              <input
                v-model.trim="newEntry.qtyUnit"
                type="text"
                class="cell-input"
                placeholder="10 pcs"
              />
            </td>

            <td data-label="Amount (LKR)" class="col-amount">
              <input
                v-model.number="newEntry.amount"
                type="number"
                min="0"
                step="0.01"
                class="cell-input amount-input"
                placeholder="0.00 *"
                @keyup.enter="addExpense"
              />
            </td>

            <td data-label="Payment Method" class="col-method">
              <select v-model="newEntry.paymentMethod" class="cell-select">
                <option v-for="method in paymentMethods" :key="method" :value="method">
                  {{ method }}
                </option>
              </select>
            </td>

            <td data-label="Status" class="col-status">
              <select
                v-model="newEntry.status"
                class="cell-select status-select"
                :class="newEntry.status.toLowerCase()"
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
              </select>
            </td>

            <td data-label="Action" class="col-action">
              <button
                type="button"
                class="btn-add"
                :disabled="!canAdd"
                @click="addExpense"
              >
                + Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';

const props = defineProps({
  // Optional current user passed by parent/session until backend attaches it automatically
  currentActor: {
    type: String,
    default: 'Auto (Session User)'
  }
});

const emit = defineEmits(['expense-created', 'expense-updated', 'expense-deleted']);

const paymentMethods = [
  'Cash Drawer',
  'Petty Cash',
  'Bank Transfer',
  'Online Card',
  'Supplier Credit'
];

const categories = [
  'Raw Ingredients (COGS)',
  'Retail Stock (COGS)',
  'Packaging & Supplies',
  'Utilities',
  'Maintenance & Repairs',
  'Staff & Payroll',
  'Rent & Other'
];

// Helper to get YYYY-MM-DD offset by N days from local date
const getOffsetDate = (daysAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayStr = getOffsetDate(0);
const yesterdayStr = getOffsetDate(1);

// Local Mock Data across Today, Yesterday, and older days
const expenses = ref([
  {
    id: 'EXP-001',
    date: todayStr,
    category: 'Raw Ingredients (COGS)',
    costType: 'Variable',
    item: 'Fresh Chicken & Vegetables',
    vendor: 'Central Market Wholesale',
    qtyUnit: '15 kg',
    amount: 18500.0,
    paymentMethod: 'Cash Drawer',
    status: 'Paid',
    recordedBy: 'Cashier 1',
    refNo: 'INV-8841'
  },
  {
    id: 'EXP-002',
    date: todayStr,
    category: 'Packaging & Supplies',
    costType: 'Variable',
    item: 'Takeaway Boxes & Kraft Bags',
    vendor: 'PackMart Lanka',
    qtyUnit: '500 pcs',
    amount: 6200.0,
    paymentMethod: 'Bank Transfer',
    status: 'Paid',
    recordedBy: 'Manager',
    refNo: 'TXN-44920'
  },
  {
    id: 'EXP-003',
    date: yesterdayStr,
    category: 'Retail Stock (COGS)',
    costType: 'Variable',
    item: 'Bottled Beverages (Restock)',
    vendor: 'Lanka Beverage Distributors',
    qtyUnit: '10 cases',
    amount: 14000.0,
    paymentMethod: 'Supplier Credit',
    status: 'Pending',
    recordedBy: 'Manager',
    refNo: 'PO-102'
  },
  {
    id: 'EXP-004',
    date: yesterdayStr,
    category: 'Maintenance & Repairs',
    costType: 'Variable',
    item: 'POS Thermal Printer Repair',
    vendor: 'TechFix Solutions',
    qtyUnit: '1 service',
    amount: 2500.0,
    paymentMethod: 'Petty Cash',
    status: 'Paid',
    recordedBy: 'Cashier 2',
    refNo: 'REC-019'
  },
  {
    id: 'EXP-005',
    date: getOffsetDate(3),
    category: 'Utilities',
    costType: 'Fixed',
    item: 'Electricity Bill',
    vendor: 'CEB',
    qtyUnit: '1 bill',
    amount: 24800.0,
    paymentMethod: 'Online Card',
    status: 'Paid',
    recordedBy: 'Owner',
    refNo: 'CEB-9921'
  },
  {
    id: 'EXP-006',
    date: getOffsetDate(5),
    category: 'Staff & Payroll',
    costType: 'Fixed',
    item: 'Weekly Shift Allowance',
    vendor: 'Internal',
    qtyUnit: '3 staff',
    amount: 9000.0,
    paymentMethod: 'Cash Drawer',
    status: 'Paid',
    recordedBy: 'Manager',
    refNo: '—'
  }
]);

// Search & Day Filter State
const searchQuery = ref('');
const selectedCategory = ref('ALL');
const selectedDate = ref('');

const hasActiveFilters = computed(
  () =>
    searchQuery.value.length > 0 ||
    selectedCategory.value !== 'ALL' ||
    selectedDate.value !== ''
);

const clearFilters = () => {
  searchQuery.value = '';
  selectedCategory.value = 'ALL';
  selectedDate.value = '';
};

// Order: Today first, Yesterday second, then descending date (newest past day first)
const sortedFilteredExpenses = computed(() => {
  const q = searchQuery.value.toLowerCase();

  const filtered = expenses.value.filter((item) => {
    const matchesCategory =
      selectedCategory.value === 'ALL' || item.category === selectedCategory.value;

    const matchesDate =
      !selectedDate.value || item.date === selectedDate.value;

    const matchesSearch =
      !q ||
      item.category.toLowerCase().includes(q) ||
      item.recordedBy.toLowerCase().includes(q) ||
      item.item.toLowerCase().includes(q) ||
      item.vendor.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q);

    return matchesCategory && matchesDate && matchesSearch;
  });

  return [...filtered].sort((a, b) => {
    const rankA = a.date === todayStr ? 0 : a.date === yesterdayStr ? 1 : 2;
    const rankB = b.date === todayStr ? 0 : b.date === yesterdayStr ? 1 : 2;

    if (rankA !== rankB) return rankA - rankB;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
});

const getDayLabel = (dateStr) => {
  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return 'Past Day';
};

const getDayClass = (dateStr) => {
  if (dateStr === todayStr) return 'day-today';
  if (dateStr === yesterdayStr) return 'day-yesterday';
  return 'day-past';
};

// New Expense Row State (no manual "who" input; backend sets actor on save)
const createBlankEntry = () => ({
  date: todayStr,
  category: 'Raw Ingredients (COGS)',
  costType: 'Variable',
  item: '',
  vendor: '',
  qtyUnit: '1 unit',
  amount: null,
  paymentMethod: 'Cash Drawer',
  status: 'Paid',
  refNo: ''
});

const newEntry = reactive(createBlankEntry());

const canAdd = computed(() => {
  return newEntry.item.length > 0 && Number(newEntry.amount) > 0;
});

const addExpense = () => {
  if (!canAdd.value) return;

  const nextNum = expenses.value.length + 1;
  const formattedId = `EXP-${String(nextNum).padStart(3, '0')}`;

  const created = {
    id: formattedId,
    date: newEntry.date || todayStr,
    category: newEntry.category,
    costType: newEntry.costType,
    item: newEntry.item,
    vendor: newEntry.vendor || 'Direct Purchase',
    qtyUnit: newEntry.qtyUnit || '1 unit',
    amount: Number(newEntry.amount),
    paymentMethod: newEntry.paymentMethod,
    status: newEntry.status,
    recordedBy: props.currentActor,
    refNo: newEntry.refNo || '—'
  };

  expenses.value.push(created);
  emit('expense-created', created);

  Object.assign(newEntry, createBlankEntry());
};

const removeExpense = (id) => {
  expenses.value = expenses.value.filter((e) => e.id !== id);
  emit('expense-deleted', id);
};

// Totals computed on visible/filtered list
const totalSpent = computed(() =>
  sortedFilteredExpenses.value.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
);

const totalPaid = computed(() =>
  sortedFilteredExpenses.value
    .filter((e) => e.status === 'Paid')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
);

const totalPending = computed(() =>
  sortedFilteredExpenses.value
    .filter((e) => e.status === 'Pending')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
);

const formatMoney = (val) => {
  return Number(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};
</script>

<style scoped>
.expense-manager {
  width: 100%;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1e293b;
}

.expense-manager *,
.expense-manager *::before,
.expense-manager *::after {
  box-sizing: border-box;
}

/* Summary Strip */
.summary-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.summary-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.summary-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.paid-text {
  color: #059669;
}

.pending-text {
  color: #d97706;
}

/* Top Search & Day Filter Bar */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.search-group {
  flex: 1 1 260px;
  min-width: 200px;
}

.filter-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.filter-input,
.filter-select {
  padding: 7px 10px;
  font-size: 0.825rem;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.search-input {
  width: 100%;
  background: #ffffff;
}

.filter-select {
  min-width: 170px;
}

.date-filter {
  min-width: 140px;
}

.filter-input:focus,
.filter-select:focus {
  outline: none;
  border-color: #2563eb;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.14);
}

.btn-clear {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-clear:hover {
  background: #e2e8f0;
}

/* Scrollable Table Container for Past Expenses */
.table-wrapper {
  width: 100%;
  max-height: 460px;
  overflow: auto;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.expense-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
}

.expense-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 12px 10px;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.expense-table td {
  padding: 10px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.expense-table tbody tr:hover {
  background-color: #f8fafc;
}

.row-pending {
  background-color: #fffbeb;
}

/* Badges & Day Labels */
.id-badge {
  font-weight: 700;
  font-size: 0.8rem;
  color: #334155;
}

.day-label {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-top: 3px;
}

.day-today {
  background: #dcfce7;
  color: #15803d;
}

.day-yesterday {
  background: #e0f2fe;
  color: #0369a1;
}

.day-past {
  background: #f1f5f9;
  color: #475569;
}

.new-badge {
  display: inline-block;
  background: #2563eb;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.sub-text {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}

.fw-600 {
  font-weight: 600;
}

.fw-500 {
  font-weight: 500;
}

.mb-4 {
  margin-bottom: 4px;
}

.type-pill {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  margin-top: 3px;
}

.type-pill.variable {
  background: #e0f2fe;
  color: #0369a1;
}

.type-pill.fixed {
  background: #f3e8ff;
  color: #7e22ce;
}

/* Editable Inputs & Selects */
.cell-input,
.cell-select {
  width: 100%;
  padding: 6px 8px;
  font-size: 0.825rem;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cell-input:focus,
.cell-select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.col-qty {
  min-width: 95px;
}

.col-amount {
  min-width: 115px;
}

.amount-input {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.col-method {
  min-width: 135px;
}

.col-status {
  min-width: 105px;
}

.date-input {
  min-width: 125px;
  font-size: 0.78rem;
}

.sub-select,
.sub-input {
  font-size: 0.75rem;
  padding: 4px 6px;
  color: #475569;
}

.status-select {
  font-weight: 600;
}

.status-select.paid {
  background-color: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}

.status-select.pending {
  background-color: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}

/* Sticky Bottom Add Row */
.new-entry-row {
  position: sticky;
  bottom: 0;
  z-index: 2;
  background-color: #f1f5f9;
  border-top: 2px solid #cbd5e1;
}

.new-entry-row:hover {
  background-color: #f1f5f9 !important;
}

/* Buttons */
.col-action {
  text-align: center;
  width: 72px;
}

.btn-add {
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.btn-add:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-add:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-icon {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  padding: 5px 8px;
  font-size: 0.85rem;
  color: #64748b;
}

.btn-delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* Responsive Card Layout (< 900px) */
@media (max-width: 900px) {
  .filter-controls {
    width: 100%;
  }

  .filter-select,
  .date-filter {
    flex: 1 1 140px;
  }

  .table-wrapper {
    max-height: 520px;
    background: transparent;
    border: none;
    box-shadow: none;
    overflow-x: visible;
    overflow-y: auto;
  }

  .expense-table,
  .expense-table thead,
  .expense-table tbody,
  .expense-table th,
  .expense-table td,
  .expense-table tr {
    display: block;
    width: 100%;
  }

  .expense-table thead {
    display: none;
  }

  .expense-table tr {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .expense-table tr.new-entry-row {
    position: static;
    background: #f8fafc;
    border: 2px dashed #94a3b8;
  }

  .expense-table td {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
    text-align: right;
  }

  .expense-table td:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .expense-table td::before {
    content: attr(data-label);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #64748b;
    text-align: left;
    flex-shrink: 0;
  }

  .expense-table td > .cell-input,
  .expense-table td > .cell-select {
    max-width: 60%;
  }

  .expense-table td:has(.mb-4) {
    flex-direction: column;
    align-items: stretch;
    text-align: left;
  }

  .expense-table td:has(.mb-4)::before {
    margin-bottom: 4px;
  }

  .amount-input {
    text-align: right;
  }

  .btn-add {
    width: 100%;
    padding: 10px;
  }
}
</style>