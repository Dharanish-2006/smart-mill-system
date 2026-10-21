import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { LiveDataProvider } from './context/LiveDataContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Motors = lazy(() => import('./pages/Motors.jsx'));
const MotorDetail = lazy(() => import('./pages/MotorDetail.jsx'));
const Process = lazy(() => import('./pages/Process.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <LiveDataProvider>
      <Suspense fallback={<div className="p-10"><Spinner label="Loading…" /></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="motors" element={<Motors />} />
            <Route path="motors/:motorId" element={<MotorDetail />} />
            <Route path="process" element={<Process />} />
            <Route path="reports" element={<Reports />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </LiveDataProvider>
  );
}
