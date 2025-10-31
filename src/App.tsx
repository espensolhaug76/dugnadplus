import { useState } from 'react'
import { LandingPage } from './components/LandingPage'
import { RegisterPage } from './components/RegisterPage'
import { LoginPage } from './components/LoginPage'
import { RoleSelectionPage } from './components/RoleSelectionPage'
import { ClubSearchPage } from './components/ClubSearchPage'
import { SportSelectionPage } from './components/SportSelectionPage'
import { TeamCreationPage } from './components/TeamCreationPage'
import { CoordinatorDashboard } from './components/CoordinatorDashboard'
import './App.css'

function App() {
  const path = window.location.pathname;

  if (path === '/register') {
    return <RegisterPage />
  }

  if (path === '/login') {
    return <LoginPage />
  }

  if (path === '/role-selection') {
    return <RoleSelectionPage />
  }

  if (path === '/club-search') {
    return <ClubSearchPage />
  }

  if (path === '/sport-selection') {
    return <SportSelectionPage />
  }

  if (path === '/team-creation') {
    return <TeamCreationPage />
  }

  if (path === '/dashboard') {
    return <CoordinatorDashboard />
  }

  return <LandingPage />
}

export default App