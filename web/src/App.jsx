import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { Spinner } from '@/components/ui/misc'
import AppShell from '@/components/AppShell'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Calendar from '@/pages/Calendar'
import Tasks from '@/pages/Tasks'
import PriceList from '@/pages/PriceList'
import Clients from '@/pages/Clients'
import ClientCard from '@/pages/ClientCard'
import Rota from '@/pages/Rota'
import Admin from '@/pages/Admin'
import Activity from '@/pages/Activity'

export default function App() {
  const { user, booting } = useSession()

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-soft">
        <Spinner />
        Loading…
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/price" element={<PriceList />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientCard />} />
        <Route path="/rota" element={<Rota />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Routes>
    </AppShell>
  )
}
