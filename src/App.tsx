import { useState } from 'react'
import { LandingPage } from './components/LandingPage'
import { RegisterPage } from './components/RegisterPage'
import { CoordinatorDashboard } from './components/CoordinatorDashboard'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('landing')

  // Simple routing (we'll add React Router later)
  if (window.location.pathname === '/register') {
    return <RegisterPage />
  }

  if (window.location.pathname === '/dashboard') {
    return <CoordinatorDashboard />
  }

  return <LandingPage />
}

export default App
