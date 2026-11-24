import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Coins, ReceiptText, Search, Store, UtensilsCrossed, Warehouse } from 'lucide-react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({ success: false }))
  if (!response.ok) throw new Error(body.error?.message || 'Request failed')
  return body.data
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return <div className="operation-page-heading"><div><p className="eyebrow">Operations</p><h2>{title}</h2><span>{subtitle}</span></div>{action && <button className="primary-button compact">{action}</button>}</div>
}

export function ManagerPages({ shopId, page }: { shopId: string; page: string }) {
  const query = useQuery({ queryKey: ['manager-page', shopId, page], queryFn: () => page === 'Reports' ? api(`/api/reports/${shopId}/sales`) : page === 'Shops' ? api('/api/shops') : page === 'Employees' ? api(`/api/employees/${shopId}?limit=50`) : page === 'Menu' ? api(`/api/menu/${shopId}`) : page === 'Inventory' ? api(`/api/inventory/${shopId}`) : page === 'Orders' ? api(`/api/orders/${shopId}?limit=50`) : page === 'Tasks' ? api(`/api/tasks/${shopId}`) : api(`/api/shops/${shopId}/settings`) })

  if (page === 'Reports') return <><PageHeader title="Reports & analytics" subtitle="Database-driven sales and operations reporting" action="Export CSV" /><section className="metric-grid"><article className="metric-card"><p>Revenue</p><strong>₹{query.data?.revenue || '0.00'}</strong></article><article className="metric-card"><p>Orders</p><strong>{query.data?.orderCount || 0}</strong></article><article className="metric-card"><p>Average order</p><strong>₹{query.data?.averageOrderValue || '0.00'}</strong></article></section><article className="panel data-panel"><div className="panel-heading"><h2>Payment methods</h2></div><div className="directory-list">{query.data?.paymentMethods?.map((row: any) => <div className="directory-row" key={row.methodCode}><Coins size={18} /><div><strong>{row.methodCode}</strong><small>{row._count._all} payments</small></div><b>₹{Number(row._sum.amount || 0).toFixed(2)}</b></div>) || <div className="empty-state">No payment data in this period.</div>}</div></article></>

  if (page === 'Shops') return <><PageHeader title="Assigned shops" subtitle="Switch to an authorized branch" /><div className="shop-grid">{query.data?.map((shop: any) => <article className="shop-card" key={shop.id}><div className="shop-icon"><Store /></div><h3>{shop.name}</h3><p>{shop.code}</p><span className={shop.isOpen ? 'status-chip' : 'status-chip danger'}>{shop.isOpen ? 'Open' : 'Closed'}</span></article>)}</div></>

  if (page === 'Employees') return <><PageHeader title="Employees" subtitle="Assignments, shifts, roles and activity" action="Add employee" /><EmployeeDirectory shopId={shopId} /></>
  if (page === 'Menu') return <><PageHeader title="Menu management" subtitle="Prices, availability, variants and add-ons" action="Add item" /><MenuManager shopId={shopId} /></>
  if (page === 'Tasks') return <><PageHeader title="Tasks & schedules" subtitle="Create, assign and approve operational work" action="Create task" /><TaskManager shopId={shopId} /></>
  if (page === 'Inventory') return <><PageHeader title="Inventory" subtitle="Stock levels, purchases, usage and wastage" action="Add stock" /><InventoryManager shopId={shopId} /></>
  if (page === 'Orders') return <><PageHeader title="Orders" subtitle="Monitor every branch order and revision" /><OrderMonitor shopId={shopId} /></>
  return <><PageHeader title="Shop settings" subtitle="Hours, tax, availability and operational policies" action="Save settings" /><ShopSettings shopId={shopId} /></>
}

export function EmployeeDirectory({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['employees-full', shopId], queryFn: () => api(`/api/employees/${shopId}?limit=50`) })
  return <article className="panel data-panel"><div className="panel-heading"><h2>Team</h2><label className="search-field"><Search size={16}/><input placeholder="Search employee" /></label></div><div className="directory-list">{query.data?.items?.map((employee: any) => <div className="directory-row" key={employee.id}><div className="avatar">{employee.fullName[0]}</div><div><strong>{employee.fullName}</strong><small>{employee.email} · {employee.role.name.replace('_', ' ')}</small></div><span className={employee.status === 'ACTIVE' ? 'status-chip' : 'status-chip danger'}>{employee.status}</span></div>) || <div className="empty-state">No employees found.</div>}</div></article>
}

export function MenuManager({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['menu-manager', shopId], queryFn: () => api(`/api/menu/${shopId}`) })
  return <article className="panel data-panel"><div className="panel-heading"><h2>Categories & items</h2></div><div className="menu-grid">{query.data?.map((category: any) => <section className="menu-category" key={category.id}><h3>{category.name}</h3>{category.items.map((item: any) => <div className="menu-row" key={item.id}><div><strong>{item.name}</strong><small>{item.description || 'No description'}</small></div><b>₹{Number(item.price).toFixed(2)}</b><div><span className={item.soldOut ? 'status-chip danger' : 'status-chip'}>{item.soldOut ? 'Sold out' : 'Available'}</span></div></div>)}</section>)}</div></article>
}

export function TaskManager({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['task-manager', shopId], queryFn: () => api(`/api/tasks/${shopId}`) })
  return <article className="panel data-panel"><div className="panel-heading"><h2>Timeline</h2></div><div className="timeline-list">{query.data?.map((task: any) => <div className="timeline-row" key={task.id}><time>{new Date(task.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{task.title}</strong><small>{task.status} · {task.completionMode}</small></div><span className="status-chip">{task.members?.length || 0} assigned</span></div>) || <div className="empty-state">No tasks scheduled.</div>}</div></article>
}

export function InventoryManager({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['inventory-manager', shopId], queryFn: () => api(`/api/inventory/${shopId}`) })
  return <article className="panel data-panel"><div className="panel-heading"><h2>Stock levels</h2></div><div className="directory-list">{query.data?.map((item: any) => { const low = Number(item.quantity) < Number(item.minimum); return <div className="directory-row" key={item.id}><Warehouse size={18}/><div><strong>{item.name}</strong><small>{item.unit}</small></div><b>{item.quantity}</b><span className={low ? 'status-chip danger' : 'status-chip'}>{low ? 'Low stock' : 'Healthy'}</span></div> })}</div></article>
}

export function OrderMonitor({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['order-monitor', shopId], queryFn: () => api(`/api/orders/${shopId}?limit=50`) })
  return <article className="panel data-panel"><div className="panel-heading"><h2>Live orders</h2></div><div className="directory-list">{query.data?.items?.map((order: any) => <div className="directory-row" key={order.id}><UtensilsCrossed size={18}/><div><strong>{order.orderNumber}</strong><small>{order.type.replace('_', ' ')} · {order.items?.length || 0} items</small></div><b>₹{Number(order.total).toFixed(2)}</b><span className="status-chip">{order.status}</span></div>)}</div></article>
}

export function ShopSettings({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['shop-settings', shopId], queryFn: () => api(`/api/shops/${shopId}/settings`) })
  return <article className="panel data-panel"><div className="settings-grid">{['Shop name','Address','Timezone','Opening time','Closing time','Tax percentage','Currency'].map((label, index) => <label key={label}>{label}<input defaultValue={index === 0 ? query.data?.shop?.name : index === 2 ? query.data?.shop?.timezone : index === 6 ? query.data?.settings?.currency : ''} /></label>)}</div></article>
}

export function KitchenPage({ shopId, page }: { shopId: string; page: string }) {
  const query = useQuery({ queryKey: ['kitchen-page', shopId, page], queryFn: () => api(`/api/kitchen/${shopId}/tickets`) })
  return <><PageHeader title={page === 'Tasks' ? 'Kitchen tasks' : 'Live kitchen'} subtitle="Real-time production and order tracking" /><section className="kitchen-grid">{query.data?.map((ticket: any) => <article className="kitchen-card" key={ticket.id}><header><div><strong>{ticket.order?.orderNumber}</strong><small>{ticket.order?.type}</small></div><span className="status-chip">{ticket.status}</span></header><div className="kitchen-items">{ticket.items.map((item: any) => <div key={item.id}><b>{item.quantity}×</b><span>{item.name}</span><span className="status-chip">{item.status}</span></div>)}</div><footer><button>Accept</button><button className="primary-button compact">Mark ready</button></footer></article>) || <div className="empty-state">No live kitchen orders.</div>}</section></>
}

export function WaiterPage({ shopId, page }: { shopId: string; page: string }) {
  const tables = useQuery({ queryKey: ['waiter-tables', shopId], queryFn: () => api(`/api/shops/${shopId}/tables`) })
  const orders = useQuery({ queryKey: ['waiter-orders', shopId], queryFn: () => api(`/api/orders/${shopId}?limit=50`) })
  if (page === 'Tables') return <><PageHeader title="Table floor" subtitle="Availability, reservations and active sessions" action="Add reservation" /><section className="table-grid">{tables.data?.map((table: any) => <article className={`table-card ${table.status.toLowerCase()}`} key={table.id}><Store/><strong>{table.name || table.number}</strong><span>{table.capacity} seats</span><small>{table.status.replace('_', ' ')}</small></article>)}</section></>
  return <><PageHeader title={page === 'New Order' ? 'Create order' : 'My orders'} subtitle="Dine-in and takeaway service tracking" /><article className="panel data-panel"><div className="directory-list">{orders.data?.items?.map((order: any) => <div className="directory-row" key={order.id}><div className="avatar"><ReceiptText size={18}/></div><div><strong>{order.orderNumber}</strong><small>{order.type.replace('_', ' ')}</small></div><b>₹{Number(order.total).toFixed(2)}</b><span className="status-chip">{order.status}</span></div>)}</div></article></>
}

export function CashierPage({ shopId, page }: { shopId: string; page: string }) {
  const orders = useQuery({ queryKey: ['cashier-orders', shopId], queryFn: () => api(`/api/orders/${shopId}?limit=50`) })
  const invoices = useQuery({ queryKey: ['cashier-invoices', shopId], enabled: page === 'Invoices', queryFn: () => api(`/api/payments/${shopId}/invoices`) })
  return <><PageHeader title={page === 'Cash Session' ? 'Cash session' : page} subtitle="Billing, payments, refunds and settlement" action={page === 'Takeaway' ? 'New takeaway' : page === 'Cash Session' ? 'Open drawer' : undefined} /><section className="cashier-grid"><article className="panel data-panel"><div className="panel-heading"><h2>{page === 'Invoices' ? 'Invoices' : 'Payment queue'}</h2></div><div className="directory-list">{(page === 'Invoices' ? invoices.data?.items : orders.data?.items)?.map((item: any) => <div className="directory-row" key={item.id}><div className="avatar"><ReceiptText size={18}/></div><div><strong>{item.orderNumber || item.invoiceNumber}</strong><small>{item.status || item.createdAt}</small></div><b>₹{Number(item.total || item.amount || 0).toFixed(2)}</b><span className="status-chip">{item.status || 'Invoice'}</span></div>)}</div></article><article className="panel"><div className="panel-heading"><h2>Settlement summary</h2></div><div className="settings-grid"><label>Opening balance<input defaultValue="0.00" /></label><label>Cash collected<input disabled value="0.00" /></label><label>Expected closing<input disabled value="0.00" /></label><label>Actual closing<input /></label></div></article></section></>
}

export function NotificationsPage({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['notifications-full', shopId], queryFn: () => api(`/api/notifications/${shopId}?limit=50`) })
  const qc = useQueryClient()
  const readAll = useMutation({ mutationFn: () => api(`/api/notifications/${shopId}/read-all`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-full', shopId] }) })
  return <><PageHeader title="Notification center" subtitle="Unread shop and role notifications" action="Mark all read" /><article className="panel data-panel"><div className="directory-list">{query.data?.items?.map((item: any) => <div className="directory-row" key={item.id}><div className={item.read ? 'avatar' : 'avatar unread'}><Bell /></div><div><strong>{item.title}</strong><small>{item.body}</small></div><span className={item.read ? 'status-chip' : 'status-chip danger'}>{item.read ? 'Read' : 'Unread'}</span></div>) || <div className="empty-state">No notifications.</div>}</div><button className="primary-button compact page-action" onClick={() => readAll.mutate()} disabled={readAll.isPending}>Mark all read</button></article></>
}

export function ReservationsPage({ shopId }: { shopId: string }) {
  const reservations = useQuery({ queryKey: ['reservations', shopId], queryFn: () => api(`/api/operations/${shopId}/reservations`) })
  const tables = useQuery({ queryKey: ['reservation-tables', shopId], queryFn: () => api(`/api/shops/${shopId}/tables`) })
  return <><PageHeader title="Table reservations" subtitle="Schedule seated guests and manage reservation status" action="New reservation" /><section className="table-grid">{tables.data?.map((table: any) => <article className="table-card" key={table.id}><Store/><strong>{table.name || table.number}</strong><span>{table.capacity} seats</span><small>{table.status}</small></article>)}</section><article className="panel data-panel"><div className="panel-heading"><h2>Reservations</h2></div><div className="directory-list">{reservations.data?.map((item: any) => <div className="directory-row" key={item.id}><div className="avatar"><Store /></div><div><strong>{item.customerName}</strong><small>{new Date(item.reservedAt).toLocaleString()} · Party of {item.partySize}</small></div><span className="status-chip">{item.status}</span></div>) || <div className="empty-state">No reservations.</div>}</div></article></>
}

export function WaitingQueuePage({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['waiting', shopId], queryFn: () => api(`/api/operations/${shopId}/waiting`) })
  return <><PageHeader title="Customer waiting queue" subtitle="Call, seat or cancel waiting parties" action="Add guest" /><article className="panel data-panel"><div className="directory-list">{query.data?.map((entry: any, index: number) => <div className="directory-row" key={entry.id}><div className="queue-number">#{index + 1}</div><div><strong>{entry.customerName || 'Walk-in guest'}</strong><small>Party of {entry.partySize}</small></div><button className="secondary-button">Call</button><button className="primary-button compact">Seat</button></div>) || <div className="empty-state">The waiting queue is empty.</div>}</div></article></>
}

export function CashSessionPage({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['cash-sessions', shopId], queryFn: () => api(`/api/operations/${shopId}/cashier-sessions`) })
  return <><PageHeader title="Cashier sessions" subtitle="Opening balance, collection and closing difference" action="Open drawer" /><section className="cashier-grid"><article className="panel data-panel"><div className="settings-grid"><label>Opening balance<input defaultValue="0.00" /></label><label>Actual closing balance<input /></label><label>Closing notes<textarea /></label></div></article><article className="panel"><div className="panel-heading"><h2>Session history</h2></div><div className="directory-list">{query.data?.map((session: any) => <div className="directory-row" key={session.id}><div><strong>{session.status}</strong><small>{new Date(session.openedAt).toLocaleString()}</small></div><b>₹{Number(session.openingBalance).toFixed(2)}</b><span className="status-chip">{session.difference ? `Δ ₹${session.difference}` : 'Open'}</span></div>)}</div></article></section></>
}

export function RefundPage({}: { shopId: string }) {
  return <><PageHeader title="Refund requests" subtitle="Approved refunds only affect financial records through audit history" /><article className="panel data-panel"><div className="empty-state">Refund requests appear here after cashier submission.</div></article></>
}

export function InventoryChecksPage({ shopId }: { shopId: string }) {
  const query = useQuery({ queryKey: ['inventory-checks', shopId], queryFn: () => api(`/api/inventory/${shopId}`) })
  return <><PageHeader title="Inventory checks" subtitle="Remaining food and stock verification" action="Start verification" /><article className="panel data-panel"><div className="directory-list">{query.data?.map((item: any) => <div className="directory-row" key={item.id}><Warehouse /><div><strong>{item.name}</strong><small>Minimum {item.minimum} {item.unit}</small></div><b>{item.quantity} {item.unit}</b><span className={Number(item.quantity) < Number(item.minimum) ? 'status-chip danger' : 'status-chip'}>{Number(item.quantity) < Number(item.minimum) ? 'Verify' : 'Verified'}</span></div>)}</div></article></>
}
