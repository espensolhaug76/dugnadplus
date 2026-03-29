# Dugnad+ - Complete File Creation Script
# This PowerShell script creates ALL remaining component files

$projectRoot = "C:\Users\esesol\OneDrive - Innlandet fylkeskommune\Documents\Dugnad+\dugnadNY"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DUGNAD+ FILE CREATION SCRIPT" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create all necessary directories
Write-Host "[1/12] Creating directory structure..." -ForegroundColor Green
$dirs = @(
    "src\components\coordinator",
    "src\components\family",
    "src\components\substitute",
    "src\components\onboarding",
    "src\types"
)

foreach ($dir in $dirs) {
    $fullPath = Join-Path $projectRoot $dir
    if (!(Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "  Created: $dir" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "[2/12] Creating BulkEventCreator.tsx..." -ForegroundColor Green
@'
import React, { useState } from 'react';
import { DugnadEvent, DugnadShift } from '../../types';

export const BulkEventCreator: React.FC = () => {
  const [eventTemplate, setEventTemplate] = useState({
    eventName: '',
    startDate: '',
    endDate: '',
    time: '18:00',
    sport: 'football',
    repeat: 'weekly',
  });

  const [shifts, setShifts] = useState<Omit<DugnadShift, 'id'>[]>([]);

  const handleSave = () => {
    // Generate events based on template
    alert('Sesongkamper funksjonen kommer snart!');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--background)' }}>
      <div className="sidebar">
        <button className="sidebar-nav-item" onClick={() => window.location.href = '/coordinator-dashboard'}>
          ← Tilbake
        </button>
      </div>

      <div className="main-content">
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '32px' }}>Opprett sesongkamper</h1>
        
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
            Bulk event creator kommer snart!
          </p>
        </div>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\coordinator\BulkEventCreator.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[3/12] Creating EventsList.tsx..." -ForegroundColor Green
@'
import React, { useState, useEffect } from 'react';
import { DugnadEvent } from '../../types';

export const EventsList: React.FC = () => {
  const [events, setEvents] = useState<DugnadEvent[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('dugnad_events');
    if (stored) {
      setEvents(JSON.parse(stored));
    }
  }, []);

  const handleDelete = (id: string) => {
    if (confirm('Er du sikker på at du vil slette dette arrangementet?')) {
      const updated = events.filter(e => e.id !== id);
      setEvents(updated);
      localStorage.setItem('dugnad_events', JSON.stringify(updated));
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--background)' }}>
      <div className="sidebar">
        <button className="sidebar-nav-item" onClick={() => window.location.href = '/coordinator-dashboard'}>
          ← Tilbake
        </button>
      </div>

      <div className="main-content">
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '32px' }}>
          Mine arrangementer ({events.length})
        </h1>

        {events.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {events.map((event) => (
              <div key={event.id} className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                      {event.eventName}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      📅 {event.date} | 📍 {event.location || 'Ikke angitt'}
                    </p>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      {event.shifts.length} vakter
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(event.id)}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--danger-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                    }}
                  >
                    Slett
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Ingen arrangementer ennå
            </p>
            <button
              onClick={() => window.location.href = '/create-event'}
              className="btn btn-primary"
            >
              Opprett ditt første arrangement
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\coordinator\EventsList.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[4/12] Creating FamilyImportPage.tsx..." -ForegroundColor Green
@'
import React from 'react';

export const FamilyImportPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--background)' }}>
      <div className="sidebar">
        <button className="sidebar-nav-item" onClick={() => window.location.href = '/coordinator-dashboard'}>
          ← Tilbake
        </button>
      </div>

      <div className="main-content">
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '32px' }}>Importer familier</h1>
        
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
            Excel/CSV import kommer snart!
          </p>
        </div>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\coordinator\FamilyImportPage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[5/12] Creating FamilyManagementPage.tsx..." -ForegroundColor Green
@'
import React from 'react';

export const FamilyManagementPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--background)' }}>
      <div className="sidebar">
        <button className="sidebar-nav-item" onClick={() => window.location.href = '/coordinator-dashboard'}>
          ← Tilbake
        </button>
      </div>

      <div className="main-content">
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '32px' }}>Administrer familier</h1>
        
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
            Familie-administrasjon kommer snart!
          </p>
        </div>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\coordinator\FamilyManagementPage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[6/12] Creating FamilyDashboard.tsx..." -ForegroundColor Green
@'
import React, { useState, useEffect } from 'react';

export const FamilyDashboard: React.FC = () => {
  const [familyData, setFamilyData] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('dugnad_family');
    if (stored) {
      setFamilyData(JSON.parse(stored));
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Familiedashboard</h1>
        <div className="badge badge-basis">Basis Nivå</div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px' }}>
        <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Dine poeng</h2>
          <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--primary-color)', marginBottom: '16px' }}>
            0
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '0%' }} />
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            100 poeng til Aktiv nivå
          </p>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Kommende vakter</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
            Ingen vakter tildelt ennå
          </p>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">🏠</div>
          Hjem
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}>
          <div className="bottom-nav-icon">📅</div>
          Vakter
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}>
          <div className="bottom-nav-icon">👨‍👩‍👧</div>
          Familie
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/points-tier'}>
          <div className="bottom-nav-icon">⭐</div>
          Poeng
        </button>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\family\FamilyDashboard.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[7/12] Creating MyShiftsPage.tsx..." -ForegroundColor Green
@'
import React from 'react';

export const MyShiftsPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Mine vakter</h1>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Ingen vakter å vise</p>
        </div>
      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}>
          <div className="bottom-nav-icon">🏠</div>
          Hjem
        </button>
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">📅</div>
          Vakter
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}>
          <div className="bottom-nav-icon">👨‍👩‍👧</div>
          Familie
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/points-tier'}>
          <div className="bottom-nav-icon">⭐</div>
          Poeng
        </button>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\family\MyShiftsPage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[8/12] Creating FamilyMembersPage.tsx..." -ForegroundColor Green
@'
import React, { useState, useEffect } from 'react';

export const FamilyMembersPage: React.FC = () => {
  const [children, setChildren] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('dugnad_family');
    if (stored) {
      const family = JSON.parse(stored);
      setChildren(family.children || []);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Familie</h1>
      </div>

      <div style={{ padding: '20px' }}>
        {children.map((child) => (
          <div key={child.id} className="card" style={{ padding: '20px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>{child.name}</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Født {child.birthYear}</p>
          </div>
        ))}
      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}>
          <div className="bottom-nav-icon">🏠</div>
          Hjem
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}>
          <div className="bottom-nav-icon">📅</div>
          Vakter
        </button>
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">👨‍👩‍👧</div>
          Familie
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/points-tier'}>
          <div className="bottom-nav-icon">⭐</div>
          Poeng
        </button>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\family\FamilyMembersPage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[9/12] Creating PointsTierPage.tsx..." -ForegroundColor Green
@'
import React from 'react';
import { TIER_LEVELS } from '../../types';

export const PointsTierPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Poeng & Nivå</h1>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="card" style={{ padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
          <div className="badge badge-basis" style={{ fontSize: '16px', padding: '8px 24px', marginBottom: '16px' }}>
            Basis Nivå
          </div>
          <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--primary-color)' }}>
            0 poeng
          </div>
        </div>

        {TIER_LEVELS.map((tier) => (
          <div key={tier.tier} className="card" style={{ padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', textTransform: 'capitalize' }}>
                {tier.tier}
              </h3>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary-color)' }}>
                {tier.pointsRequired}+ poeng
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tier.benefits.map((benefit, i) => (
                <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  ✓ {benefit}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}>
          <div className="bottom-nav-icon">🏠</div>
          Hjem
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}>
          <div className="bottom-nav-icon">📅</div>
          Vakter
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}>
          <div className="bottom-nav-icon">👨‍👩‍👧</div>
          Familie
        </button>
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">⭐</div>
          Poeng
        </button>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\family\PointsTierPage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[10/12] Creating SubstituteMarketplacePage.tsx..." -ForegroundColor Green
@'
import React from 'react';

export const SubstituteMarketplacePage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '32px' }}>Vikar-markedsplass</h1>
      
      <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
          Vikar-markedsplass kommer snart!
        </p>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\substitute\SubstituteMarketplacePage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[11/12] Creating MySubstituteJobsPage.tsx..." -ForegroundColor Green
@'
import React from 'react';

export const MySubstituteJobsPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '32px' }}>Mine vikaroppdrag</h1>
      
      <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
          Ingen vikaroppdrag ennå
        </p>
      </div>
    </div>
  );
};
'@ | Set-Content "$projectRoot\src\components\substitute\MySubstituteJobsPage.tsx" -Encoding UTF8

Write-Host ""
Write-Host "[12/12] Verifying all files were created..." -ForegroundColor Green

$allFiles = @(
    "src\components\coordinator\BulkEventCreator.tsx",
    "src\components\coordinator\EventsList.tsx",
    "src\components\coordinator\FamilyImportPage.tsx",
    "src\components\coordinator\FamilyManagementPage.tsx",
    "src\components\family\FamilyDashboard.tsx",
    "src\components\family\MyShiftsPage.tsx",
    "src\components\family\FamilyMembersPage.tsx",
    "src\components\family\PointsTierPage.tsx",
    "src\components\substitute\SubstituteMarketplacePage.tsx",
    "src\components\substitute\MySubstituteJobsPage.tsx"
)

$created = 0
$failed = 0

foreach ($file in $allFiles) {
    $fullPath = Join-Path $projectRoot $file
    if (Test-Path $fullPath) {
        $created++
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        $failed++
        Write-Host "  ✗ $file" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SCRIPT COMPLETE!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Files created: $created" -ForegroundColor Green
Write-Host "Files failed: $failed" -ForegroundColor Red
Write-Host ""

if ($failed -eq 0) {
    Write-Host "✓ All files created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Run: npm install" -ForegroundColor Gray
    Write-Host "2. Run: npm run dev" -ForegroundColor Gray
    Write-Host "3. Open browser to test the app!" -ForegroundColor Gray
} else {
    Write-Host "⚠ Some files failed to create. Please check the errors above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
'@ | Set-Content "/mnt/user-data/outputs/CREATE_ALL_FILES.ps1" -Encoding UTF8

Write-Host "✅ PowerShell script created!" -ForegroundColor Green
