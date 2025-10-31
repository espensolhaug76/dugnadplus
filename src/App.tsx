import { useState } from 'react'
import { LandingPage } from './components/LandingPage'
import { RegisterPage } from './components/RegisterPage'
import { LoginPage } from './components/LoginPage'
import { RoleSelectionPage } from './components/RoleSelectionPage'
import { ClubSearchPage } from './components/ClubSearchPage'
import { SportSelectionPage } from './components/SportSelectionPage'
import { TeamCreationPage } from './components/TeamCreationPage'
import { FamilyClubSearchPage } from './components/FamilyClubSearchPage'
import { FamilyTeamSelectionPage } from './components/FamilyTeamSelectionPage'
import { FamilyMembersPage } from './components/FamilyMembersPage'
import { FamilyTeamAssignmentPage } from './components/FamilyTeamAssignmentPage'
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

  // Coordinator Flow
  if (path === '/club-search') {
    return <ClubSearchPage />
  }

  if (path === '/sport-selection') {
    return <SportSelectionPage />
  }

  if (path === '/team-creation') {
    return <TeamCreationPage />
  }

  // Family Flow
  if (path === '/family-club-search') {
    return <FamilyClubSearchPage />
  }

  if (path === '/family-team-selection') {
    return <FamilyTeamSelectionPage />
  }

  if (path === '/family-members') {
    return <FamilyMembersPage />
  }

  if (path === '/family-team-assignment') {
    return <FamilyTeamAssignmentPage />
  }

  if (path === '/dashboard') {
    return <CoordinatorDashboard />
  }

  return <LandingPage />
}

export default App