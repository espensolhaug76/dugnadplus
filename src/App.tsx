import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Onboarding & Auth
import { LandingPage } from './components/onboarding/LandingPage';
import { LoginPage } from './components/onboarding/LoginPage';
import { RegisterPage } from './components/onboarding/RegisterPage';
import { RoleSelectionPage } from './components/onboarding/RoleSelectionPage';
import { ClubCreationPage } from './components/onboarding/ClubCreationPage';
import { ClubSelectionPage } from './components/onboarding/ClubSelectionPage';
import { TeamSetupPage } from './components/onboarding/TeamSetupPage';
import { TeamSelectionPage } from './components/onboarding/TeamSelectionPage';
import { FamilyProfileSetupPage } from './components/onboarding/FamilyProfileSetupPage';
import { ClaimFamilyPage } from './components/onboarding/ClaimFamilyPage';

// Koordinator
import { CoordinatorLayout } from './components/coordinator/CoordinatorLayout';
import { CoordinatorDashboard } from './components/coordinator/CoordinatorDashboard';
import { CreateEvent } from './components/coordinator/CreateEvent';
import { EventsList } from './components/coordinator/EventsList';
import { ManualShiftAssignment } from './components/coordinator/ManualShiftAssignment';
import { AttendancePage } from './components/coordinator/AttendancePage';
import { ManageFamilies } from './components/coordinator/ManageFamilies';
import { ImportFamilies } from './components/coordinator/ImportFamilies';
import { LotteryAdmin } from './components/coordinator/LotteryAdmin';

// Familie
import { FamilyDashboard } from './components/family/FamilyDashboard';
import { MyShiftsPage } from './components/family/MyShiftsPage';
import { FamilyMembersPage } from './components/family/FamilyMembersPage';
import { PointsTierPage } from './components/family/PointsTierPage';
import { MyLottery } from './components/family/MyLottery';
import { LotteryShop } from './components/family/LotteryShop';

// Vikar
import { SubstituteMarketplacePage } from './components/substitute/SubstituteMarketplacePage';
import { SubstituteDashboard } from './components/substitute/SubstituteDashboard';
import { MySubstituteJobsPage } from './components/substitute/MySubstituteJobsPage';
import { SubstituteProfilePage } from './components/substitute/SubstituteProfilePage';

// Common
import { DevTools } from './components/common/DevTools';

function App() {
  return (
    <Router>
      {/* HER VAR FEILEN: 
        Vi bruker nå inline styles for å TVINGE appen til å bruke hele skjermen.
        Dette overstyrer standardinnstillinger som 'max-width' eller 'text-align: center' 
        som ofte ligger i index.css i nye prosjekter.
      */}
      <div style={{ 
          width: '100vw', 
          minHeight: '100vh', 
          margin: 0, 
          padding: '16px 0 0 16px', 
          maxWidth: 'none', 
          boxSizing: 'border-box',
          background: 'var(--background, #f8fafc)' 
      }}>
        <Routes>
          {/* Public / Onboarding */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/role-selection" element={<RoleSelectionPage />} />
          
          <Route path="/create-club" element={<ClubCreationPage />} />
          <Route path="/select-club" element={<ClubSelectionPage />} />
          <Route path="/setup-team" element={<TeamSetupPage />} />
          <Route path="/select-team" element={<TeamSelectionPage />} />
          <Route path="/setup-family" element={<FamilyProfileSetupPage />} />
          <Route path="/claim-family" element={<ClaimFamilyPage />} />

          {/* Koordinator (Inne i Layout) */}
          <Route path="/coordinator-dashboard" element={<CoordinatorLayout><CoordinatorDashboard /></CoordinatorLayout>} />
          <Route path="/create-event" element={<CoordinatorLayout><CreateEvent /></CoordinatorLayout>} />
          <Route path="/events-list" element={<CoordinatorLayout><EventsList /></CoordinatorLayout>} />
          <Route path="/manual-shift-assignment" element={<CoordinatorLayout><ManualShiftAssignment /></CoordinatorLayout>} />
          <Route path="/attendance" element={<CoordinatorLayout><AttendancePage /></CoordinatorLayout>} />
          <Route path="/lottery-admin" element={<CoordinatorLayout><LotteryAdmin /></CoordinatorLayout>} />
          <Route path="/manage-families" element={<CoordinatorLayout><ManageFamilies /></CoordinatorLayout>} />
          <Route path="/import-families" element={<CoordinatorLayout><ImportFamilies /></CoordinatorLayout>} />

          {/* Familie */}
          <Route path="/family-dashboard" element={<FamilyDashboard />} />
          <Route path="/my-shifts" element={<MyShiftsPage />} />
          <Route path="/family-members" element={<FamilyMembersPage />} />
          <Route path="/points-tier" element={<PointsTierPage />} />
          <Route path="/my-lottery" element={<MyLottery />} />
          <Route path="/lottery-shop" element={<LotteryShop />} />

          {/* Vikar */}
          <Route path="/substitute-dashboard" element={<SubstituteDashboard />} />
          <Route path="/substitute-marketplace" element={<SubstituteMarketplacePage />} />
          <Route path="/my-substitute-jobs" element={<MySubstituteJobsPage />} />
          <Route path="/substitute-profile" element={<SubstituteProfilePage />} />
        </Routes>

        {/* Utviklerverktøy */}
        <DevTools />
      </div>
    </Router>
  );
}

export default App;
