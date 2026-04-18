import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

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
import { JoinPage } from './components/onboarding/JoinPage';

// Koordinator
import { CoordinatorLayout } from './components/coordinator/CoordinatorLayout';
import { CoordinatorDashboard } from './components/coordinator/CoordinatorDashboard';
import { CreateEvent } from './components/coordinator/CreateEvent';
import { EventsList } from './components/coordinator/EventsList';
import { ManualShiftAssignment } from './components/coordinator/ManualShiftAssignment';
import { PremiumPage } from './components/coordinator/PremiumPage';
import { SalesCampaignPage } from './components/coordinator/SalesCampaignPage';
import { CampaignShop } from './components/coordinator/CampaignShop';
import { MultiDayBulkCreator } from './components/coordinator/MultiDayBulkCreator';
import { AttendancePage } from './components/coordinator/AttendancePage';
import { ManageFamilies } from './components/coordinator/ManageFamilies';
import { ImportFamilies } from './components/coordinator/ImportFamilies';
import { LotteryAdmin } from './components/coordinator/LotteryAdmin';
import { CampaignOverviewPage } from './components/coordinator/CampaignOverviewPage';

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

// Markedsplass
import { MarketplacePage } from './components/marketplace/MarketplacePage';
import { CreateListingPage } from './components/marketplace/CreateListingPage';
import { ListingDetailPage } from './components/marketplace/ListingDetailPage';

// Kiosk
import { KioskAdmin } from './components/kiosk/KioskAdmin';
import { KioskShop } from './components/kiosk/KioskShop';

// Foreldre
import { ParentDashboard } from './components/parent/ParentDashboard';
import { ParentSwapPage } from './components/parent/ParentSwapPage';

// SMS
import { SmsSettingsPage } from './components/coordinator/SmsSettingsPage';

// Common
import { SponsorAdmin } from './components/sponsors/SponsorAdmin';
import { SponsorPage } from './components/sponsors/SponsorPage';
import { DevTools } from './components/common/DevTools';
import { ThemeProvider } from './components/theme/ThemeContext';
import { ThemeSettings } from './components/theme/ThemeSettings';

const FULL_BLEED_PATHS = ['/', '/login', '/register', '/join', '/campaign-shop', '/kiosk', '/lottery-shop', '/sponsors', '/parent-dashboard', '/parent-swap'];

function AppContent() {
  const location = useLocation();
  const isFullBleed = FULL_BLEED_PATHS.includes(location.pathname);

  return (
      <div style={{
          width: '100%',
          minHeight: '100vh',
          margin: 0,
          padding: isFullBleed ? '0' : '16px 0 0 16px',
          maxWidth: 'none',
          boxSizing: 'border-box',
          background: isFullBleed ? 'none' : 'var(--background, #f8fafc)'
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
          <Route path="/join" element={<JoinPage />} />

          {/* Koordinator (Inne i Layout) */}
          <Route path="/coordinator-dashboard" element={<CoordinatorLayout><CoordinatorDashboard /></CoordinatorLayout>} />
          <Route path="/create-event" element={<CoordinatorLayout><CreateEvent /></CoordinatorLayout>} />
          <Route path="/events-list" element={<CoordinatorLayout><EventsList /></CoordinatorLayout>} />
          <Route path="/manual-shift-assignment" element={<CoordinatorLayout><ManualShiftAssignment /></CoordinatorLayout>} />
          <Route path="/multi-day-event" element={<CoordinatorLayout><MultiDayBulkCreator /></CoordinatorLayout>} />
          <Route path="/attendance" element={<CoordinatorLayout><AttendancePage /></CoordinatorLayout>} />
          <Route path="/campaign-overview" element={<CoordinatorLayout><CampaignOverviewPage /></CoordinatorLayout>} />
          <Route path="/lottery-admin" element={<CoordinatorLayout><LotteryAdmin /></CoordinatorLayout>} />
          <Route path="/manage-families" element={<CoordinatorLayout><ManageFamilies /></CoordinatorLayout>} />
          <Route path="/import-families" element={<CoordinatorLayout><ImportFamilies /></CoordinatorLayout>} />

          {/* Salgskampanje */}
          <Route path="/sales-campaign" element={<CoordinatorLayout><SalesCampaignPage /></CoordinatorLayout>} />
          <Route path="/campaign-shop" element={<CampaignShop />} />

          {/* Premium */}
          <Route path="/premium" element={<PremiumPage />} />

          {/* Sponsorer */}
          <Route path="/sponsor-admin" element={<CoordinatorLayout><SponsorAdmin /></CoordinatorLayout>} />
          <Route path="/sponsors" element={<SponsorPage />} />

          {/* Tema */}
          <Route path="/theme-settings" element={<CoordinatorLayout><ThemeSettings /></CoordinatorLayout>} />

          {/* Kiosk */}
          <Route path="/kiosk-admin" element={<CoordinatorLayout><KioskAdmin /></CoordinatorLayout>} />
          <Route path="/kiosk" element={<KioskShop />} />

          {/* Markedsplass */}
          <Route path="/marketplace" element={<CoordinatorLayout><MarketplacePage /></CoordinatorLayout>} />
          <Route path="/marketplace/create" element={<CoordinatorLayout><CreateListingPage /></CoordinatorLayout>} />
          <Route path="/marketplace/:id" element={<CoordinatorLayout><ListingDetailPage /></CoordinatorLayout>} />

          {/* Foreldre (ny) */}
          <Route path="/parent-dashboard" element={<ParentDashboard />} />
          <Route path="/parent-swap" element={<ParentSwapPage />} />

          {/* SMS Innstillinger */}
          <Route path="/settings/sms" element={<CoordinatorLayout><SmsSettingsPage /></CoordinatorLayout>} />

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

        {/* Utviklerverktøy — kun i dev. Vite erstatter import.meta.env.DEV
            med `false` ved prod-build, så uttrykket blir dead code og
            DevTools-komponenten tree-shakes ut av produksjons-bundlen. */}
        {import.meta.env.DEV && <DevTools />}
      </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

export default App;
