import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home, CalendarPlus, CalendarDays, ClipboardPlus, ReceiptText, WalletCards,
  Bell, UserRound, LogOut, Menu, X, Stethoscope, RotateCcw
} from 'lucide-react';
import { useApp } from './AppContext.jsx';

const navItems = [
  { to: '/portal', label: '首页', icon: Home, end: true },
  { to: '/portal/booking', label: '预约就诊', icon: CalendarPlus },
  { to: '/portal/clinics', label: '诊所信息', icon: Stethoscope },
  { to: '/portal/appointments', label: '我的预约', icon: CalendarDays },
  { to: '/portal/visits', label: '就诊记录', icon: ClipboardPlus },
  { to: '/portal/charges', label: '收费账单', icon: ReceiptText },
  { to: '/portal/payments', label: '支付订单', icon: WalletCards },
  { to: '/portal/refunds', label: '退款记录', icon: RotateCcw },
  { to: '/portal/notifications', label: '站内通知', icon: Bell },
  { to: '/portal/profile', label: '个人资料', icon: UserRound }
];

export default function PatientLayout() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const doLogout = async () => { await logout(); navigate('/login'); };
  return <div className="patient-shell">
    <aside className={'patient-sidebar ' + (open ? 'open' : '')}>
      <div className="patient-brand">
        <div className="brand-mark"><img src="/app-icon-192.png" alt="" /></div>
        <div><strong>ADC 患者服务</strong><span>Patient Portal</span></div>
        <button className="mobile-close icon-btn" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      <nav>
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={18} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="patient-sidebar-foot"><Stethoscope size={15} /><span>仅展示本人授权的医疗与费用信息</span></div>
    </aside>
    <div className="patient-main">
      <header className="patient-topbar">
        <button className="mobile-menu icon-btn" onClick={() => setOpen(true)}><Menu size={20} /></button>
        <div className="patient-title">安德鲁牙科连锁 · 患者服务</div>
        <div className="user-area">
          <div className="avatar">{user.displayName.slice(0, 1)}</div>
          <div className="user-meta"><strong>{user.displayName}</strong><span>{user.linkStatus === 'ACTIVE' ? '患者账号' : '账号待核验'}</span></div>
          <button className="icon-btn" title="退出登录" onClick={doLogout}><LogOut size={18} /></button>
        </div>
      </header>
      <main className="patient-content"><Outlet /></main>
    </div>
    {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
  </div>;
}
