/**
 * Dugnad+ Coordinator Dashboard
 * Mobile interface for dugnadsansvarlig
 * 
 * Features:
 * - Season shift creation
 * - Automatic assignment trigger
 * - Family oversight
 * - Issue alerts and notifications
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { DugnadCoordinatorService } from '../services/dugnad-coordinator-service';

interface DashboardStats {
  totalShifts: number;
  assignedShifts: number;
  pendingShifts: number;
  completedShifts: number;
  familiesNeedingFollowup: number;
  upcomingIssues: number;
}

export const CoordinatorDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  
  const coordinatorService = new DugnadCoordinatorService();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      // const teamId = await getCurrentTeamId();
      // const data = await coordinatorService.getCoordinatorDashboard(teamId);
      
      // Mock data for now
      setStats({
        totalShifts: 48,
        assignedShifts: 38,
        pendingShifts: 7,
        completedShifts: 3,
        familiesNeedingFollowup: 5,
        upcomingIssues: 2
      });
    } catch (error) {
      Alert.alert('Feil', 'Kunne ikke laste oversikt');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const handleAutoAssign = async () => {
    Alert.alert(
      'Automatisk tildeling',
      'Dette vil tildele alle ventende vakter til familier med lavest poengsum. Fortsette?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Tildel',
          onPress: async () => {
            try {
              setAssigning(true);
              // const teamId = await getCurrentTeamId();
              // const result = await coordinatorService.assignShiftsAutomatically(teamId);
              
              // Mock success
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              Alert.alert(
                'Tildeling fullført',
                `38 vakter tildelt automatisk\n7 vakter trenger oppfølging`,
                [{ text: 'OK', onPress: loadDashboard }]
              );
            } catch (error) {
              Alert.alert('Feil', 'Kunne ikke tildele vakter');
            } finally {
              setAssigning(false);
            }
          }
        }
      ]
    );
  };

  const navigateToShiftCreation = () => {
    // Navigate to shift creation screen
    console.log('Navigate to shift creation');
  };

  const navigateToFamilyList = () => {
    // Navigate to family overview
    console.log('Navigate to family list');
  };

  const navigateToIssues = () => {
    // Navigate to issues/alerts
    console.log('Navigate to issues');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Laster oversikt...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Dugnadsoversikt</Text>
        <Text style={styles.subtitle}>Kil Fotball G9 - Sesong 2025</Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.totalShifts || 0}</Text>
          <Text style={styles.statLabel}>Totalt vakter</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, styles.successColor]}>
            {stats?.assignedShifts || 0}
          </Text>
          <Text style={styles.statLabel}>Tildelt</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, styles.warningColor]}>
            {stats?.pendingShifts || 0}
          </Text>
          <Text style={styles.statLabel}>Venter</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, styles.completeColor]}>
            {stats?.completedShifts || 0}
          </Text>
          <Text style={styles.statLabel}>Fullført</Text>
        </View>
      </View>

      {/* Alerts */}
      {(stats?.familiesNeedingFollowup || 0) > 0 && (
        <TouchableOpacity
          style={styles.alertCard}
          onPress={navigateToFamilyList}
        >
          <View style={styles.alertIcon}>
            <Text style={styles.alertIconText}>⚠️</Text>
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>
              {stats?.familiesNeedingFollowup} familier trenger oppfølging
            </Text>
            <Text style={styles.alertText}>
              Manglende bekreftelse eller betaling
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {(stats?.upcomingIssues || 0) > 0 && (
        <TouchableOpacity
          style={[styles.alertCard, styles.urgentAlert]}
          onPress={navigateToIssues}
        >
          <View style={styles.alertIcon}>
            <Text style={styles.alertIconText}>🔴</Text>
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>
              {stats?.upcomingIssues} vakter mangler dekning
            </Text>
            <Text style={styles.alertText}>
              Vurdér vikarmarkedsplass eller manuell tildeling
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <Text style={styles.sectionTitle}>Handlinger</Text>
        
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={navigateToShiftCreation}
          disabled={assigning}
        >
          <Text style={styles.primaryButtonText}>
            📅 Legg inn vakter for sesongen
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, styles.autoAssignButton]}
          onPress={handleAutoAssign}
          disabled={assigning || (stats?.pendingShifts || 0) === 0}
        >
          {assigning ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              ⚡ Tildel automatisk ({stats?.pendingShifts || 0} vakter)
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={navigateToFamilyList}
        >
          <Text style={styles.secondaryButtonText}>
            👥 Se familier og poeng
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Info */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Hvordan det fungerer</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoNumber}>1</Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>Legg inn vakter:</Text> Opprett alle
            vakter for sesongen én gang
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoNumber}>2</Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>Automatisk tildeling:</Text> Systemet
            fordeler vakter rettferdig basert på poeng
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoNumber}>3</Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>Familier får 14 dager:</Text> Buffer
            for bytte eller finne vikar før eskalering
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoNumber}>4</Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>Kun varsler ved behov:</Text> Du får
            beskjed kun når noe trenger oppfølging
          </Text>
        </View>
      </View>

      {/* Bottom spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666'
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333'
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center'
  },
  successColor: {
    color: '#34C759'
  },
  warningColor: {
    color: '#FF9500'
  },
  completeColor: {
    color: '#007AFF'
  },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF3CD',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500'
  },
  urgentAlert: {
    backgroundColor: '#FFE5E5',
    borderLeftColor: '#FF3B30'
  },
  alertIcon: {
    marginRight: 12
  },
  alertIconText: {
    fontSize: 24
  },
  alertContent: {
    flex: 1
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4
  },
  alertText: {
    fontSize: 14,
    color: '#666'
  },
  actionSection: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center'
  },
  autoAssignButton: {
    backgroundColor: '#34C759'
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF'
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600'
  },
  infoSection: {
    padding: 16
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  infoNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 12,
    width: 32
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20
  },
  infoBold: {
    fontWeight: '600',
    color: '#333'
  },
  bottomSpacing: {
    height: 40
  }
});
