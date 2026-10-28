import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './components/AppContext.jsx';
import Layout from './components/Layout.jsx';
import PatientLayout from './components/PatientLayout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Appointments from './pages/Appointments.jsx';
import Schedules from './pages/Schedules.jsx';
import Dentists from './pages/Dentists.jsx';
import Clinics from './pages/Clinics.jsx';
import Treatments from './pages/Treatments.jsx';
import Visits from './pages/Visits.jsx';
import VisitDetail from './pages/VisitDetail.jsx';
import Settlements from './pages/Settlements.jsx';
import SettlementDetail from './pages/SettlementDetail.jsx';
import Costs from './pages/Costs.jsx';
import Performance from './pages/Performance.jsx';
import Records from './pages/Records.jsx';
import Audit from './pages/Audit.jsx';
import PatientHome from './pages/patient/PatientHome.jsx';
import PatientClinics from './pages/patient/PatientClinics.jsx';
import PatientBooking from './pages/patient/PatientBooking.jsx';
import PatientAppointments from './pages/patient/PatientAppointments.jsx';
import PatientAppointmentDetail from './pages/patient/PatientAppointmentDetail.jsx';
import PatientPayments from './pages/patient/PatientPayments.jsx';
import PatientRefunds from './pages/patient/PatientRefunds.jsx';
import PatientPaymentDetail from './pages/patient/PatientPaymentDetail.jsx';
import PatientVisits from './pages/patient/PatientVisits.jsx';
import PatientVisitDetail from './pages/patient/PatientVisitDetail.jsx';
import PatientCharges from './pages/patient/PatientCharges.jsx';
import PatientChargeDetail from './pages/patient/PatientChargeDetail.jsx';
import PatientNotifications from './pages/patient/PatientNotifications.jsx';
import PatientProfile from './pages/patient/PatientProfile.jsx';
import PatientBindings from './pages/staff/PatientBindings.jsx';
import Refunds from './pages/staff/Refunds.jsx';
import PaymentOrders from './pages/staff/PaymentOrders.jsx';
import SettlementExceptions from './pages/staff/SettlementExceptions.jsx';

function Protected() {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <div className="boot"><Loading label="正在验证登录状态…" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.portal === 'PATIENT') return <Navigate to="/portal" replace />;
  return <Layout />;
}

function PatientProtected() {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <div className="boot"><Loading label="正在验证登录状态…" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.portal !== 'PATIENT') return <Navigate to="/" replace />;
  return <PatientLayout />;
}

function PublicOnly({ children }) {
  const { user, loading } = useApp();
  if (loading) return <div className="boot"><Loading /></div>;
  return user ? <Navigate to={user.portal === 'PATIENT' ? '/portal' : '/'} replace /> : children;
}

export default function App() {
  return <AppProvider>
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/dentists" element={<Dentists />} />
        <Route path="/clinics" element={<Clinics />} />
        <Route path="/treatments" element={<Treatments />} />
        <Route path="/visits" element={<Visits />} />
        <Route path="/visits/:id" element={<VisitDetail />} />
        <Route path="/settlements" element={<Settlements />} />
        <Route path="/settlements/:id" element={<SettlementDetail />} />
        <Route path="/costs" element={<Costs />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/records" element={<Records />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/patient-bindings" element={<PatientBindings />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/payment-orders" element={<PaymentOrders />} />
        <Route path="/settlement-exceptions" element={<SettlementExceptions />} />
      </Route>
      <Route path="/portal" element={<PatientProtected />}>
        <Route index element={<PatientHome />} />
        <Route path="clinics" element={<PatientClinics />} />
        <Route path="booking" element={<PatientBooking />} />
        <Route path="appointments" element={<PatientAppointments />} />
        <Route path="appointments/:id" element={<PatientAppointmentDetail />} />
        <Route path="payments" element={<PatientPayments />} />
        <Route path="payments/:id" element={<PatientPaymentDetail />} />
        <Route path="refunds" element={<PatientRefunds />} />
        <Route path="visits" element={<PatientVisits />} />
        <Route path="visits/:id" element={<PatientVisitDetail />} />
        <Route path="charges" element={<PatientCharges />} />
        <Route path="charges/:id" element={<PatientChargeDetail />} />
        <Route path="notifications" element={<PatientNotifications />} />
        <Route path="profile" element={<PatientProfile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AppProvider>;
}
