import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, BarChart3, Bell, ChefHat, ClipboardCheck, IndianRupee, LayoutDashboard, LogOut, ReceiptText, ShieldCheck, ShoppingCart, Store, UserCog, Users, UtensilsCrossed, Warehouse } from 'lucide-react'
import { ManagerPages, KitchenPage, WaiterPage, CashierPage, NotificationsPage, ReservationsPage, WaitingQueuePage, CashSessionPage, RefundPage, InventoryChecksPage } from './pages/RolePages'
import { AdminExecutiveDashboard, AdminBranches, AdminUsers, AdminProcurement, AdminFinance, AdminAnalytics, AdminAdministration, AdminLiveOperations } from './pages/AdminPages'
import './App.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

type User = { id: string; name: string; email: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN_STAFF'; employeeShops: Shop[]; managerShops: Shop[] }
type Shop = { id: string; code: string; name: string }

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({ success: false }))
  if (!response.ok) throw new Error(body.error?.message || 'Request failed')
  return body.data
}

function App() {
  const [csrfToken, setCsrfToken] = useState('')
  const [selectedShop, setSelectedShop] = useState<string>('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [activeNav, setActiveNav] = useState('Overview')
  const queryClient = useQueryClient()

  const me = useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => { try { return await api('/api/auth/me') } catch { return null } },
  })

  const dashboard = useQuery({
    queryKey: ['dashboard', selectedShop],
    enabled: !!selectedShop && me.data?.role === 'MANAGER',
    queryFn: () => api(`/api/shops/${selectedShop}/dashboard`),
  })

  const notificationCenter = useQuery({ queryKey: ['notifications', selectedShop], enabled: !!selectedShop, queryFn: () => api(`/api/notifications/${selectedShop}?limit=10`) })

  const login = useMutation({
    mutationFn: async () => api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }),
    onSuccess: (data) => { setCsrfToken(data.csrfToken); setLoginError(''); queryClient.invalidateQueries({ queryKey: ['me'] }) },
    onError: (error: Error) => setLoginError(error.message),
  })

  const logout = useMutation({ mutationFn: async () => api('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } }), onSuccess: () => { setCsrfToken(''); queryClient.setQueryData(['me'], null) } })

  const adminBranchesList = useQuery({ queryKey:['admin-branch-options'], enabled: me.data?.role === 'ADMIN', queryFn: () => api('/api/admin/branches?limit=100') })

  useEffect(() => {
    if (!me.data) return
    if (me.data.role === 'ADMIN') {
      setActiveNav((current) => current === 'Overview' ? 'Executive Dashboard' : current)
      const options = adminBranchesList.data?.items || []
      if (options[0]) setSelectedShop((current) => current || options[0].id)
    } else {
      const shops = me.data.role === 'MANAGER' ? me.data.managerShops : me.data.employeeShops
      if (shops[0]) setSelectedShop((current) => current || shops[0].id)
    }
  }, [me.data, adminBranchesList.data])

  if (me.isLoading) return <div className="loading-screen"><div className="skeleton-card" /><p>Loading workspace…</p></div>

  if (!me.data) return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark"><UtensilsCrossed size={28} /></div>
        <p>Restaurant Operations</p>
        <h1>Run every shift with clarity.</h1>
        <span>Secure multi-branch workforce, order and kitchen operations.</span>
      </section>
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); login.mutate() }}>
        <h2>Sign in</h2>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@restaurant.local" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="••••••••" /></label>
        {loginError && <div className="error-banner" role="alert">{loginError}</div>}
        <button className="primary-button" type="submit" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
    </main>
  )

  const roleLabels: Record<User['role'], string> = { ADMIN: 'Administrator', MANAGER: 'Manager', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN_STAFF: 'Kitchen Staff' }
  const shops = me.data.role === 'ADMIN' ? (adminBranchesList.data?.items || []) : me.data.role === 'MANAGER' ? me.data.managerShops : me.data.employeeShops
  const nav = me.data.role === 'ADMIN'
    ? [['Executive Dashboard', LayoutDashboard], ['Live Operations', Activity], ['Business Intelligence', BarChart3], ['Branches', Store], ['Managers', UserCog], ['Employees', ClipboardCheck], ['Users', Users], ['Roles and Permissions', ShieldCheck], ['Menus', UtensilsCrossed], ['Orders', ShoppingCart], ['Kitchen', ChefHat], ['Tasks', ClipboardCheck], ['Inventory', Warehouse], ['Suppliers', Store], ['Purchases', ReceiptText], ['Expenses', IndianRupee], ['Financial Overview', IndianRupee], ['Profit & Loss', BarChart3], ['Payroll', Users], ['Sales Analytics', BarChart3], ['Audit Logs', ShieldCheck], ['Notifications', Bell], ['Active Sessions', Users], ['System Health', Activity], ['Global Settings', LayoutDashboard]]
    : me.data.role === 'MANAGER'
    ? [['Overview', LayoutDashboard], ['Shops', Store], ['Employees', ClipboardCheck], ['Tasks', ClipboardCheck], ['Menu', UtensilsCrossed], ['Orders', ShoppingCart], ['Inventory', Warehouse], ['Reports', ReceiptText], ['Settings', LayoutDashboard], ['Notifications', Bell]]
    : me.data.role === 'KITCHEN_STAFF'
      ? [['Live Orders', ChefHat], ['Preparing', ChefHat], ['Ready', ReceiptText], ['Tasks', ClipboardCheck], ['Inventory Checks', Warehouse], ['Notifications', Bell]]
      : me.data.role === 'CASHIER'
        ? [['Home', LayoutDashboard], ['Takeaway', ShoppingCart], ['Payments', ReceiptText], ['Invoices', ReceiptText], ['Refunds', ReceiptText], ['Cash Session', ReceiptText], ['Tasks', ClipboardCheck], ['Notifications', Bell]]
        : [['Home', LayoutDashboard], ['Tables', Store], ['New Order', ShoppingCart], ['My Orders', ReceiptText], ['Reservations', Store], ['Waiting Queue', Store], ['Tasks', ClipboardCheck], ['Notifications', Bell]]

  const orderRows = dashboard.data?.orders as Array<{ status: string; _count: { _all: number }; _sum: { total: unknown } }> | undefined
  const taskRows = dashboard.data?.tasks as Array<{ status: string; _count: { _all: number } }> | undefined
  const orderCount = orderRows?.reduce((sum, row) => sum + row._count._all, 0)
  const pendingOrders = orderRows?.filter((row) => ['SUBMITTED', 'ACCEPTED', 'PREPARING', 'PARTIALLY_READY'].includes(row.status)).reduce((sum, row) => sum + row._count._all, 0)
  const completedTasks = taskRows?.filter((row) => row.status === 'COMPLETED').reduce((sum, row) => sum + row._count._all, 0)
  const inventoryAlerts = (dashboard.data?.inventoryAlerts as unknown[] | undefined)?.length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><UtensilsCrossed size={22} /></div><span>RestaurantOS</span></div>
        <nav>{nav.map(([label, Icon]) => { const Component = Icon as typeof LayoutDashboard; return <button key={String(label)} className={String(label) === activeNav ? 'active' : ''} onClick={() => setActiveNav(String(label))}><Component size={19} /><span>{String(label)}</span></button> })}</nav>
        <button className="logout-button" onClick={() => logout.mutate()}><LogOut size={18} /> Sign out</button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{roleLabels[me.data.role]}</p><h1>{me.data.name}</h1></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={20} />{Number(notificationCenter.data?.unread || 0) > 0 && <span className="notification-dot" />}</button>
            <select value={selectedShop} onChange={(event) => setSelectedShop(event.target.value)} aria-label="Select shop">
              {shops.map((shop: any) => <option key={shop.id} value={shop.id}>{shop.code} · {shop.name}</option>)}
            </select>
          </div>
        </header>
        <section className="dashboard">
          {me.data.role === 'ADMIN' ? (
            activeNav === 'Executive Dashboard' ? <AdminExecutiveDashboard /> :
            activeNav === 'Live Operations' ? <AdminLiveOperations /> :
            activeNav === 'Branches' ? <AdminBranches /> :
            activeNav === 'Users' || activeNav === 'Managers' || activeNav === 'Employees' ? <AdminUsers /> :
            activeNav === 'Audit Logs' || activeNav === 'Activity History' || activeNav === 'Roles and Permissions' || activeNav === 'Active Sessions' || activeNav === 'System Health' || activeNav === 'Global Settings' ? <AdminAdministration page={activeNav} /> :
            activeNav === 'Suppliers' || activeNav === 'Purchases' || activeNav === 'Expenses' ? <AdminProcurement page={activeNav} /> :
            activeNav === 'Financial Overview' || activeNav === 'Profit & Loss' || activeNav === 'Payroll' ? <AdminFinance page={activeNav} /> :
            activeNav.includes('Analytics') || activeNav === 'Business Intelligence' || activeNav === 'Profitability' ? <AdminAnalytics page={activeNav} /> :
            <AdminExecutiveDashboard />
          ) : (['Overview','Home','Live Orders'].includes(activeNav)) ? (
            <>
              <div className="welcome-card"><div><p className="eyebrow">Current shift</p><h2>Good to see you, {me.data.name.split(' ')[0]}</h2><p>All authorized operations are synced with this branch.</p></div><div className="status-pill"><span /> Shop connected</div></div>
              <div className="metric-grid">
                {[['Today’s orders', orderCount], ['Pending orders', pendingOrders], ['Completed tasks', completedTasks], ['Inventory alerts', inventoryAlerts]].map(([title, value]) => <article className="metric-card" key={String(title)}><p>{String(title)}</p><strong>{value === undefined ? '—' : String(value)}</strong><span className="positive">Live data</span></article>)}
              </div>
              <div className="content-grid">
                <article className="panel"><div className="panel-heading"><h2>Today’s operations</h2><button>View all</button></div><div className="timeline"><div><time>Now</time><span className="timeline-dot active" /><p><strong>Operations dashboard</strong><small>Branch data is ready for authorized actions</small></p></div><div><time>Next</time><span className="timeline-dot" /><p><strong>Task and order synchronization</strong><small>Realtime updates active after shop subscription</small></p></div></div></article>
                <article className="panel"><div className="panel-heading"><h2>Quick actions</h2></div><div className="quick-actions">{me.data.role === 'KITCHEN_STAFF' ? <><button><ChefHat /> Live kitchen</button><button><ClipboardCheck /> Start task</button></> : me.data.role === 'CASHIER' ? <><button><ShoppingCart /> New takeaway</button><button><ReceiptText /> Payment queue</button></> : me.data.role === 'WAITER' ? <><button><Store /> Select table</button><button><ShoppingCart /> New order</button></> : <><button><UtensilsCrossed /> Manage menu</button><button><ClipboardCheck /> Assign tasks</button></>}</div></article>
              </div>
            </>
          ) : activeNav === 'Notifications' ? (
            <NotificationsPage shopId={selectedShop} />
          ) : activeNav === 'Reservations' ? (
            <ReservationsPage shopId={selectedShop} />
          ) : activeNav === 'Waiting Queue' ? (
            <WaitingQueuePage shopId={selectedShop} />
          ) : activeNav === 'Cash Session' ? (
            <CashSessionPage shopId={selectedShop} />
          ) : activeNav === 'Refunds' ? (
            <RefundPage shopId={selectedShop} />
          ) : activeNav === 'Inventory Checks' ? (
            <InventoryChecksPage shopId={selectedShop} />
          ) : me.data.role === 'MANAGER' ? (
            <ManagerPages shopId={selectedShop} page={activeNav === 'Shops' ? 'Shops' : activeNav === 'Settings' ? 'Settings' : activeNav} />
          ) : me.data.role === 'KITCHEN_STAFF' ? (
            <KitchenPage shopId={selectedShop} page={activeNav} />
          ) : me.data.role === 'CASHIER' ? (
            <CashierPage shopId={selectedShop} page={activeNav} />
          ) : (
            <WaiterPage shopId={selectedShop} page={activeNav} />
          )}
        </section>
      </main>
      <nav className="bottom-nav">{nav.slice(0, 5).map(([label, Icon]) => { const Component = Icon as typeof LayoutDashboard; return <button key={String(label)} className={String(label) === activeNav ? 'active' : ''} onClick={() => setActiveNav(String(label))}><Component size={20} /><span>{String(label).replace('Live Orders', 'Kitchen').replace('New Order', 'Order')}</span></button> })}</nav>
    </div>
  )
}

export default App
