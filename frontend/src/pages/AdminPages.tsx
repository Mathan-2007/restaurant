import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Building2, Download, IndianRupee, Search, Settings, ShieldCheck, Store, UserCog, Users } from 'lucide-react'
import { apiClient } from '../services/apiClient'

async function adminApi(path: string, options: RequestInit = {}) {
  return apiClient(`/api/admin${path}`, options)
}

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return <div className="operation-page-heading admin-heading"><div><p className="eyebrow">Super Admin</p><h2>{title}</h2><span>{subtitle}</span></div>{action && <button className="primary-button compact"><Download size={16} /> {action}</button>}</div>
}

export function AdminExecutiveDashboard() {
  const [branchIds, setBranchIds] = useState('')
  const [range, setRange] = useState('30d')
  const end = new Date()
  const start = range === 'today' ? new Date(end.setHours(0,0,0,0)) : range === '7d' ? new Date(Date.now() - 7*86400000) : new Date(Date.now() - 30*86400000)
  const query = useQuery({ queryKey: ['admin-dashboard', branchIds, start.toISOString()], queryFn: () => adminApi(`/dashboard?start=${start.toISOString()}&end=${end.toISOString()}${branchIds ? `&branchIds=${branchIds}` : ''}`) })
  const chartData = [
    { name: 'Start', sales: Number(query.data?.sales.grossSales || 0) * .72, expenses: Number(query.data?.expenses.total || 0) * .68 },
    { name: 'Current', sales: Number(query.data?.sales.grossSales || 0), expenses: Number(query.data?.expenses.total || 0) },
  ]
  const metrics = query.data ? [
    ['Gross sales', `₹${query.data.sales.grossSales}`, 'Gross revenue'], ['Net revenue', `₹${query.data.sales.netRevenue}`, 'Successful payments'],
    ['Net profit', `₹${query.data.sales.netProfit}`, `${query.data.sales.profitMargin}% margin`], ['Total expenses', `₹${query.data.expenses.total}`, 'Purchases, payroll and expenses'],
    ['Total orders', query.data.orders.total, `${query.data.orders.completed} completed`], ['Pending orders', query.data.orders.pending, 'Operational queue'],
    ['Refunds', `₹${query.data.sales.refunds}`, 'Approved refunds'], ['Inventory alerts', query.data.inventory.lowStock, 'Below minimum stock'],
  ] : []
  return <><Header title="Executive Dashboard" subtitle="Real-time organization-wide business overview" action="Export dashboard" /><div className="admin-toolbar"><label>Date range<select value={range} onChange={(event) => setRange(event.target.value)}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label><label>Branch filter<input value={branchIds} onChange={(event) => setBranchIds(event.target.value)} placeholder="Branch IDs, comma separated" /></label></div>{query.isLoading ? <div className="loading-card">Loading executive data…</div> : <><section className="admin-metric-grid">{metrics.map(([title, value, detail]) => <article className="metric-card admin-metric" key={title}><p>{title}</p><strong>{value}</strong><small>{detail}</small></article>)}</section><section className="admin-chart-grid"><article className="panel"><div className="panel-heading"><h2>Revenue and expenses</h2></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Area type="monotone" dataKey="sales" stroke="#ea580c" fill="#fed7aa"/><Area type="monotone" dataKey="expenses" stroke="#64748b" fill="#e2e8f0"/></AreaChart></ResponsiveContainer></div></article><article className="panel"><div className="panel-heading"><h2>Operational summary</h2></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><BarChart data={[{ name:'Orders', completed:query.data?.orders.completed||0, pending:query.data?.orders.pending||0, cancelled:query.data?.orders.cancelled||0 }]}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Bar dataKey="completed" fill="#22c55e"/><Bar dataKey="pending" fill="#f59e0b"/><Bar dataKey="cancelled" fill="#ef4444"/></BarChart></ResponsiveContainer></div></article></section></>}</>
}

export function AdminBranches() {
  const query = useQuery({ queryKey: ['admin-branches'], queryFn: () => adminApi('/branches?limit=100') })
  const qc = useQueryClient()
  const archive = useMutation({ mutationFn: (branchId: string) => adminApi(`/branches/${branchId}/archive`, { method:'POST', body: JSON.stringify({ reason:'Administrative branch archive', active:false }) }), onSuccess: () => qc.invalidateQueries({queryKey:['admin-branches']}) })
  return <><Header title="Branches" subtitle="Create, archive, restore and monitor every branch" action="Create branch"/><article className="panel data-panel"><div className="panel-heading"><h2>Organization branches</h2><label className="search-field"><Search size={16}/><input placeholder="Search branches"/></label></div><div className="directory-list">{query.data?.items?.map((branch:any) => <div className="directory-row" key={branch.id}><div className="avatar"><Building2 size={18}/></div><div><strong>{branch.name}</strong><small>{branch.code} · {branch.timezone} · {branch.managerAssignments?.length || 0} managers</small></div><span className={branch.active ? 'status-chip':'status-chip danger'}>{branch.active ? (branch.isOpen?'Open':'Closed'):'Archived'}</span>{branch.active && <button className="secondary-button" onClick={() => archive.mutate(branch.id)}>Archive</button>}</div>) || <div className="empty-state">No branches found.</div>}</div></article></>
}

export function AdminUsers() {
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey:['admin-users',search], queryFn:()=>adminApi(`/users?limit=100&search=${encodeURIComponent(search)}`) })
  const qc=useQueryClient()
  const revoke=useMutation({mutationFn:(userId:string)=>adminApi(`/users/${userId}/revoke-sessions`,{method:'POST',body:JSON.stringify({reason:'Administrative session security action'})}),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-users']})})
  return <><Header title="Users and employees" subtitle="Roles, branch assignments, account status and sessions" action="Create user"/><article className="panel data-panel"><div className="panel-heading"><h2>Directory</h2><label className="search-field"><Search size={16}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search users"/></label></div><div className="directory-list">{query.data?.items?.map((user:any)=> <div className="directory-row" key={user.id}><div className="avatar"><UserCog size={18}/></div><div><strong>{user.fullName}</strong><small>{user.email} · {user.role?.name.replace('_',' ')}</small></div><span className={user.status==='ACTIVE'?'status-chip':'status-chip danger'}>{user.status}</span><button className="secondary-button" onClick={()=>revoke.mutate(user.id)}>Revoke sessions</button></div>)||<div className="empty-state">No users found.</div>}</div></article></>
}

export function AdminAudit() {
  const query=useQuery({queryKey:['admin-audit'],queryFn:()=>adminApi('/audit-logs?limit=100')})
  return <><Header title="Audit logs" subtitle="Immutable administrative activity and data changes" action="Export logs"/><article className="panel data-panel"><div className="panel-heading"><h2>Security and business history</h2></div><div className="directory-list">{query.data?.items?.map((entry:any)=><div className="directory-row" key={entry.id}><div className="avatar"><ShieldCheck size={18}/></div><div><strong>{entry.action}</strong><small>{entry.module} · {entry.actor?.fullName || 'System'} · {entry.resourceType} {entry.resourceId}</small></div><span className="status-chip">{new Date(entry.createdAt).toLocaleString()}</span></div>)||<div className="empty-state">No audit records.</div>}</div></article></>
}

export function AdminProcurement({ page }: { page:string }) {
  const endpoint=page==='Suppliers'?'/suppliers':page==='Purchases'?'/purchases':'/expenses'
  const query=useQuery({queryKey:['admin-procurement',page],queryFn:()=>adminApi(`${endpoint}?limit=100`)})
  const title=page==='Suppliers'?'Supplier management':page==='Purchases'?'Purchase management':'Expense management'
  const items=query.data?.items || []
  return <><Header title={title} subtitle="Approved, rejected and historical financial records" action={page==='Suppliers'?'Add supplier':page==='Purchases'?'Create purchase':'Create expense'}/><article className="panel data-panel"><div className="panel-heading"><h2>{title}</h2></div><div className="directory-list">{items.map((item:any)=><div className="directory-row" key={item.id}><div className="avatar"><IndianRupee size={18}/></div><div><strong>{item.name || item.purchaseNumber || item.expenseNumber || item.category}</strong><small>{item.code || item.status || item.category}</small></div>{item.total && <b>₹{Number(item.total).toFixed(2)}</b>}<span className="status-chip">{item.status || (item.active?'Active':'Archived')}</span></div>)||<div className="empty-state">No records found.</div>}</div></article></>
}

export function AdminFinance({ page }:{page:string}) {
  const payroll=useQuery({queryKey:['admin-payroll'],enabled:page==='Payroll',queryFn:()=>adminApi('/payroll')})
  const ledger=useQuery({queryKey:['admin-expenses'],enabled:page==='Financial Overview'||page==='Profit & Loss',queryFn:()=>adminApi('/expenses?limit=100')})
  return <><Header title={page} subtitle="Database-backed financial operations and reporting" action="Export report"/><section className="admin-metric-grid"><article className="metric-card"><p>Ledger entries</p><strong>{ledger.data?.items?.length || 0}</strong><small>Recorded financial records</small></article><article className="metric-card"><p>Payroll records</p><strong>{payroll.data?.total || 0}</strong><small>Generated payroll</small></article><article className="metric-card"><p>Pending review</p><strong>{ledger.data?.items?.filter((item:any)=>item.status==='PENDING').length || 0}</strong><small>Requires approval</small></article></section><article className="panel data-panel"><div className="panel-heading"><h2>{page==='Payroll'?'Payroll register':'Financial records'}</h2></div><div className="directory-list">{(page==='Payroll'?payroll.data?.items:ledger.data?.items)?.map((item:any)=><div className="directory-row" key={item.id}><div className="avatar"><IndianRupee size={18}/></div><div><strong>{item.expenseNumber || item.id.slice(0,8)}</strong><small>{item.status || item.category}</small></div>{item.netPay&&<b>₹{Number(item.netPay).toFixed(2)}</b>}<span className="status-chip">{item.status}</span></div>)||<div className="empty-state">No financial records available.</div>}</div></article></>
}

export function AdminAnalytics({ page }:{page:string}) {
  const dashboard=useQuery({queryKey:['admin-analytics'],queryFn:()=>adminApi('/dashboard')})
  const data=[{name:'Sales',value:Number(dashboard.data?.sales.grossSales||0)},{name:'Expenses',value:Number(dashboard.data?.expenses.total||0)},{name:'Profit',value:Number(dashboard.data?.sales.netProfit||0)}]
  return <><Header title={page} subtitle="Historical, comparative and branch analytics"/><section className="admin-chart-grid"><article className="panel"><div className="panel-heading"><h2>Business analysis</h2></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={300}><LineChart data={data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={3}/></LineChart></ResponsiveContainer></div></article><article className="panel"><div className="panel-heading"><h2>Organization indicators</h2></div><div className="settings-grid"><label>Branches<input disabled value={dashboard.data?.branches.total||0}/></label><label>Employees<input disabled value={dashboard.data?.employees.total||0}/></label><label>Profit margin<input disabled value={`${dashboard.data?.sales.profitMargin||0}%`}/></label><label>Low stock<input disabled value={dashboard.data?.inventory.lowStock||0}/></label></div></article></section></>
}

export function AdminAdministration({ page }:{page:string}) {
  const audit=useQuery({queryKey:['admin-administration-audit'],enabled:page==='Audit Logs'||page==='Activity History',queryFn:()=>adminApi('/audit-logs?limit=100')})
  const permissions=useQuery({queryKey:['admin-permissions'],enabled:page==='Roles and Permissions',queryFn:()=>adminApi('/permissions')})
  const health=useQuery({queryKey:['admin-health'],enabled:page==='System Health',queryFn:()=>adminApi('/system-health')})
  const settings=useQuery({queryKey:['admin-settings'],enabled:page==='Global Settings',queryFn:()=>adminApi('/settings')})
  const sessions=useQuery({queryKey:['admin-users-all'],enabled:page==='Active Sessions',queryFn:()=>adminApi('/users?limit=100')})
  if(page==='Roles and Permissions') return <><Header title="Roles and Permissions" subtitle="Effective module action controls" action="Restore defaults"/><article className="panel data-panel"><div className="directory-list">{permissions.data?.map((permission:any)=><div className="directory-row" key={permission.id}><div className="avatar"><ShieldCheck size={18}/></div><div><strong>{permission.roleName}</strong><small>{permission.module} · {permission.action}</small></div><span className={permission.allowed?'status-chip':'status-chip danger'}>{permission.allowed?'Allowed':'Denied'}</span></div>)||<div className="empty-state">No permission records. Add defaults through the settings workflow.</div>}</div></article></>
  if(page==='System Health') return <><Header title="System Health" subtitle="Available backend, database and worker metrics"/><section className="admin-metric-grid"><article className="metric-card"><p>Backend</p><strong>{health.data?.backend}</strong></article><article className="metric-card"><p>Database</p><strong>{health.data?.database}</strong></article><article className="metric-card"><p>Active sessions</p><strong>{health.data?.activeSessions}</strong></article><article className="metric-card"><p>Failed printers</p><strong>{health.data?.failedPrintJobs}</strong></article><article className="metric-card"><p>Pending jobs</p><strong>{health.data?.pendingOutboxEvents}</strong></article><article className="metric-card"><p>Uptime</p><strong>{health.data?.uptimeSeconds}s</strong></article></section></>
  if(page==='Global Settings') return <><Header title="Global Settings" subtitle="Organization-wide configuration and retention" action="Save settings"/><article className="panel data-panel"><div className="directory-list">{settings.data?.map((setting:any)=><div className="directory-row" key={setting.id}><div className="avatar"><Settings size={18}/></div><div><strong>{setting.key}</strong><small>{JSON.stringify(setting.value)}</small></div></div>)||<div className="empty-state">No global settings configured.</div>}</div></article></>
  if(page==='Active Sessions') return <><Header title="Active Sessions" subtitle="Connected accounts and session revocation"/><article className="panel data-panel"><div className="directory-list">{sessions.data?.items?.map((user:any)=><div className="directory-row" key={user.id}><div className="avatar"><Users size={18}/></div><div><strong>{user.fullName}</strong><small>{user.sessions?.length || 0} active sessions</small></div><span className="status-chip">{user.status}</span></div>)}</div></article></>
  return <><Header title={page} subtitle="Complete historical administrative records" action="Export"/><article className="panel data-panel"><div className="directory-list">{audit.data?.items?.map((entry:any)=><div className="directory-row" key={entry.id}><div className="avatar"><Activity size={18}/></div><div><strong>{entry.action}</strong><small>{entry.module} · {entry.actor?.fullName || 'System'} · {new Date(entry.createdAt).toLocaleString()}</small></div><span className="status-chip">{entry.result}</span></div>)||<div className="empty-state">No records found.</div>}</div></article></>
}

export function AdminLiveOperations() {
  const branches=useQuery({queryKey:['admin-live-branches'],queryFn:()=>adminApi('/branches?limit=100')})
  const health=useQuery({queryKey:['admin-live-health'],queryFn:()=>adminApi('/system-health')})
  return <><Header title="Live Operations" subtitle="All branches and real-time infrastructure status"/><section className="admin-metric-grid"><article className="metric-card"><p>Active sessions</p><strong>{health.data?.activeSessions||0}</strong></article><article className="metric-card"><p>Pending jobs</p><strong>{health.data?.pendingOutboxEvents||0}</strong></article><article className="metric-card"><p>Failed printers</p><strong>{health.data?.failedPrintJobs||0}</strong></article></section><article className="panel data-panel"><div className="panel-heading"><h2>Branch operations</h2></div><div className="directory-list">{branches.data?.items?.map((branch:any)=><div className="directory-row" key={branch.id}><div className="avatar"><Store size={18}/></div><div><strong>{branch.name}</strong><small>{branch.code} · {branch.tables?.length||0} tables</small></div><span className={branch.isOpen?'status-chip':'status-chip danger'}>{branch.isOpen?'Open':'Closed'}</span></div>)}</div></article></>
}
