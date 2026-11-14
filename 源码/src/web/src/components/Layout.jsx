import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarDays, CalendarClock, Stethoscope, Building2,
  BadgeDollarSign, ClipboardPlus, ReceiptText, WalletCards, ChartNoAxesCombined,
  SearchCheck, ScrollText, LogOut, Menu, X, ShieldCheck, UserRoundCheck, RotateCcw,
  AlertTriangle, ClipboardList, BellRing, CalendarRange
} from 'lucide-react';
import { useApp } from './AppContext.jsx';

const roleLabels = { HQ_MANAGER: '总部管理人员', CLINIC_MANAGER: '诊所主管', FRONT_DESK: '前台人员', DENTIST: '牙医' };
const navGroups = [
  {
    label: '工作台',
    items: [{ to: '/', label: '今日概览', icon: LayoutDashboard, exact: true }]
  },
  {
    label: '临床',
    items: [
      { to: '/patients', label: '患者档案', icon: Users, roles: ['FRONT_DESK','DENTIST','CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/treatment-plans', label: '治疗方案', icon: ClipboardList, roles: ['FRONT_DESK','DENTIST','CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/recalls', label: '召回与复查', icon: BellRing, roles: ['FRONT_DESK','DENTIST','CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/visits', label: '就诊与治疗', icon: ClipboardPlus }
    ]
  },
  {
    label: '日程',
    items: [
      { to: '/appointments', label: '预约管理', icon: CalendarDays },
      { to: '/schedule-board', label: '日程看板', icon: CalendarRange },
      { to: '/schedules', label: '排班与出诊', icon: CalendarClock }
    ]
  },
  {
    label: '财务',
    items: [
      { to: '/settlements', label: '结算单', icon: ReceiptText },
      { to: '/refunds', label: '退款审核', icon: RotateCcw, roles: ['CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/payment-orders', label: '患者支付订单', icon: WalletCards, roles: ['FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/costs', label: '成本审核', icon: WalletCards, roles: ['CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/performance', label: '季度绩效', icon: ChartNoAxesCombined, roles: ['DENTIST','CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/settlement-exceptions', label: '结算资金异常', icon: AlertTriangle, roles: ['CLINIC_MANAGER','HQ_MANAGER'] }
    ]
  },
  {
    label: '运营',
    items: [
      { to: '/clinics', label: '诊所信息', icon: Building2 },
      { to: '/dentists', label: '牙医与资质', icon: Stethoscope },
      { to: '/treatments', label: '治疗项目', icon: BadgeDollarSign },
      { to: '/patient-bindings', label: '患者绑定审核', icon: UserRoundCheck, roles: ['FRONT_DESK','CLINIC_MANAGER','HQ_MANAGER'] },
      { to: '/records', label: '历史查询', icon: SearchCheck },
      { to: '/audit', label: '审计日志', icon: ScrollText, roles: ['HQ_MANAGER'] }
    ]
  }
];

export default function Layout() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const groups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(user.role)) })).filter((group) => group.items.length);
  const doLogout = async () => { await logout(); navigate('/login'); };
  const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' });
  return <div className="app-shell">
    <aside className={'sidebar ' + (open ? 'open' : '')}>
      <div className="brand"><div className="brand-mark"><img src="/app-icon-192.png" alt="" /></div><div><strong>ADC 牙科连锁</strong><span>Dental Practice OS</span></div><button className="mobile-close icon-btn" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <nav>
        {groups.map((group) => <div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.items.map(({ to, label, icon: Icon, exact }) => <NavLink key={to} to={to} end={exact} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={17} /><span>{label}</span></NavLink>)}</div>)}
      </nav>
      <div className="sidebar-foot"><ShieldCheck size={16} /><span>数据按角色与诊所范围隔离</span></div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <button className="mobile-menu icon-btn" onClick={() => setOpen(true)}><Menu size={20} /></button>
        <div className="topbar-context"><span className="topbar-kicker">ADC INTERNAL</span><strong>临床与运营管理台</strong></div>
        <div className="topbar-day">{today}</div>
        <div className="user-area"><div className="avatar">{user.displayName.slice(0, 1)}</div><div className="user-meta"><strong>{user.displayName}</strong><span>{roleLabels[user.role]}{user.clinicIds?.length ? ' · ' + user.clinicIds.length + ' 家诊所' : user.role === 'HQ_MANAGER' ? ' · 全部门店' : ''}</span></div><button className="icon-btn" title="退出登录" onClick={doLogout}><LogOut size={18} /></button></div>
      </header>
      <main className="content"><Outlet /></main>
    </div>
    {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
  </div>;
}
