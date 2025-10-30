/**
 * Dugnad+ Season Shift Creator
 * Bulk shift creation interface for coordinators
 * 
 * Features:
 * - Template-based shift creation
 * - Recurring shift patterns
 * - Season-long planning
 * - Point value calculation
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Switch,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ShiftTemplate {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  role: string;
  requiredPeople: number;
  pointValue: number;
}

const SHIFT_ROLES = [
  { value: 'kiosk', label: 'Kiosk', pointsPerHour: 100 },
  { value: 'ticket_sales', label: 'Billettsalg', pointsPerHour: 100 },
  { value: 'setup', label: 'Rigge/Setup', pointsPerHour: 100 },
  { value: 'cleanup', label: 'Rydde/Cleanup', pointsPerHour: 100 },
  { value: 'baking', label: 'Baking', pointsPerHour: 50 },
  { value: 'transport', label: 'Transport', pointsPerHour: 75 }
];

const RECURRING_PATTERNS = [
  { value: 'weekly', label: 'Hver uke' },
  { value: 'biweekly', label: 'Annenhver uke' },
  { value: 'monthly', label: 'Hver måned' },
  { value: 'custom', label: 'Egendefinert' }
];

export const SeasonShiftCreator: React.FC = () => {
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Current shift being created
  const [currentShift, setCurrentShift] = useState<Partial<ShiftTemplate>>({
    date: new Date(),
    startTime: '10:00',
    endTime: '14:00',
    role: 'kiosk',
    requiredPeople: 2,
    pointValue: 400
  });
  
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPattern, setRecurringPattern] = useState('weekly');
  const [recurringCount, setRecurringCount] = useState('10');

  const calculatePointValue = (startTime: string, endTime: string, role: string) => {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    const hours = (end - start) / 60;
    
    const roleData = SHIFT_ROLES.find(r => r.value === role);
    const pointsPerHour = roleData?.pointsPerHour || 100;
    
    return Math.round(hours * pointsPerHour);
  };

  const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const handleAddShift = () => {
    if (!currentShift.date || !currentShift.role) {
      Alert.alert('Mangler info', 'Vennligst fyll ut alle felt');
      return;
    }

    const newShifts: ShiftTemplate[] = [];

    if (isRecurring) {
      // Generate recurring shifts
      const count = parseInt(recurringCount) || 1;
      let currentDate = new Date(currentShift.date);

      for (let i = 0; i < count; i++) {
        newShifts.push({
          id: `${Date.now()}-${i}`,
          date: new Date(currentDate),
          startTime: currentShift.startTime!,
          endTime: currentShift.endTime!,
          role: currentShift.role!,
          requiredPeople: currentShift.requiredPeople || 1,
          pointValue: currentShift.pointValue || 0
        });

        // Increment date based on pattern
        switch (recurringPattern) {
          case 'weekly':
            currentDate.setDate(currentDate.getDate() + 7);
            break;
          case 'biweekly':
            currentDate.setDate(currentDate.getDate() + 14);
            break;
          case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + 1);
            break;
        }
      }
    } else {
      // Single shift
      newShifts.push({
        id: `${Date.now()}`,
        date: currentShift.date!,
        startTime: currentShift.startTime!,
        endTime: currentShift.endTime!,
        role: currentShift.role!,
        requiredPeople: currentShift.requiredPeople || 1,
        pointValue: currentShift.pointValue || 0
      });
    }

    setShifts([...shifts, ...newShifts]);
    Alert.alert(
      'Vakter lagt til',
      `${newShifts.length} vakt(er) lagt til i sesongen`
    );
  };

  const handleSaveSeasonShifts = async () => {
    if (shifts.length === 0) {
      Alert.alert('Ingen vakter', 'Legg til minst én vakt først');
      return;
    }

    Alert.alert(
      'Lagre sesongvakter',
      `Vil du lagre ${shifts.length} vakter for sesongen? Dette vil starte automatisk tildeling.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Lagre',
          onPress: async () => {
            try {
              setSaving(true);
              // await coordinatorService.createSeasonShifts(teamId, shifts, coordinatorId);
              
              // Mock delay
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              Alert.alert(
                'Sesongvakter opprettet',
                'Vaktene er opprettet og vil bli tildelt automatisk basert på poeng',
                [{ text: 'OK', onPress: () => {
                  // Navigate back to dashboard
                }}]
              );
            } catch (error) {
              Alert.alert('Feil', 'Kunne ikke lagre vakter');
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteShift = (id: string) => {
    setShifts(shifts.filter(s => s.id !== id));
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('nb-NO', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    });
  };

  const getRoleLabel = (roleValue: string): string => {
    return SHIFT_ROLES.find(r => r.value === roleValue)?.label || roleValue;
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Legg inn sesongvakter</Text>
          <Text style={styles.subtitle}>
            Opprett alle vakter én gang, systemet fordeler automatisk
          </Text>
        </View>

        {/* Shift Creator Form */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Ny vakt</Text>

          {/* Date Picker */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Dato</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowDatePicker(true)}
            >
              <Text>{formatDate(currentShift.date || new Date())}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={currentShift.date || new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) {
                    setCurrentShift({ ...currentShift, date });
                  }
                }}
              />
            )}
          </View>

          {/* Time Pickers */}
          <View style={styles.timeRow}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Fra kl.</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowTimePicker('start')}
              >
                <Text>{currentShift.startTime}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Til kl.</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowTimePicker('end')}
              >
                <Text>{currentShift.endTime}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Role Picker */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Type dugnad</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {SHIFT_ROLES.map(role => (
                <TouchableOpacity
                  key={role.value}
                  style={[
                    styles.roleChip,
                    currentShift.role === role.value && styles.roleChipSelected
                  ]}
                  onPress={() => {
                    const pointValue = calculatePointValue(
                      currentShift.startTime!,
                      currentShift.endTime!,
                      role.value
                    );
                    setCurrentShift({
                      ...currentShift,
                      role: role.value,
                      pointValue
                    });
                  }}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      currentShift.role === role.value && styles.roleChipTextSelected
                    ]}
                  >
                    {role.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Required People */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Antall personer</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() =>
                  setCurrentShift({
                    ...currentShift,
                    requiredPeople: Math.max(1, (currentShift.requiredPeople || 1) - 1)
                  })
                }
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>
                {currentShift.requiredPeople || 1}
              </Text>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() =>
                  setCurrentShift({
                    ...currentShift,
                    requiredPeople: (currentShift.requiredPeople || 1) + 1
                  })
                }
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Point Value Display */}
          <View style={styles.pointValueBox}>
            <Text style={styles.pointValueLabel}>Poengverdi:</Text>
            <Text style={styles.pointValue}>{currentShift.pointValue} poeng</Text>
          </View>

          {/* Recurring Options */}
          <View style={styles.formGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Gjentakende vakt</Text>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: '#DDD', true: '#007AFF' }}
              />
            </View>
            
            {isRecurring && (
              <>
                <View style={styles.recurringOptions}>
                  {RECURRING_PATTERNS.map(pattern => (
                    <TouchableOpacity
                      key={pattern.value}
                      style={[
                        styles.patternChip,
                        recurringPattern === pattern.value && styles.patternChipSelected
                      ]}
                      onPress={() => setRecurringPattern(pattern.value)}
                    >
                      <Text
                        style={[
                          styles.patternChipText,
                          recurringPattern === pattern.value && styles.patternChipTextSelected
                        ]}
                      >
                        {pattern.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Antall gjentakelser"
                  keyboardType="number-pad"
                  value={recurringCount}
                  onChangeText={setRecurringCount}
                />
              </>
            )}
          </View>

          {/* Add Shift Button */}
          <TouchableOpacity style={styles.addButton} onPress={handleAddShift}>
            <Text style={styles.addButtonText}>
              + Legg til vakt{isRecurring ? 'er' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Shifts List */}
        {shifts.length > 0 && (
          <View style={styles.shiftsSection}>
            <Text style={styles.sectionTitle}>
              Vakter for sesongen ({shifts.length})
            </Text>
            
            {shifts.map(shift => (
              <View key={shift.id} style={styles.shiftCard}>
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftDate}>{formatDate(shift.date)}</Text>
                  <Text style={styles.shiftTime}>
                    {shift.startTime} - {shift.endTime}
                  </Text>
                  <Text style={styles.shiftRole}>{getRoleLabel(shift.role)}</Text>
                  <Text style={styles.shiftDetails}>
                    {shift.requiredPeople} person(er) • {shift.pointValue} poeng
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteShift(shift.id)}
                >
                  <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Save Button */}
      {shifts.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveSeasonShifts}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Lagrer...' : `Lagre ${shifts.length} vakter`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  scrollView: {
    flex: 1
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9
  },
  formSection: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16
  },
  formGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  input: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD'
  },
  timeRow: {
    flexDirection: 'row'
  },
  roleChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#DDD'
  },
  roleChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF'
  },
  roleChipText: {
    fontSize: 14,
    color: '#666'
  },
  roleChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600'
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#DDD'
  },
  counterButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 20
  },
  counterButtonText: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: 'bold'
  },
  counterValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#333'
  },
  pointValueBox: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  pointValueLabel: {
    fontSize: 14,
    color: '#2E7D32'
  },
  pointValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32'
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  recurringOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 12
  },
  patternChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDD'
  },
  patternChipSelected: {
    backgroundColor: '#34C759',
    borderColor: '#34C759'
  },
  patternChipText: {
    fontSize: 14,
    color: '#666'
  },
  patternChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600'
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  shiftsSection: {
    padding: 16
  },
  shiftCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  shiftInfo: {
    flex: 1
  },
  shiftDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4
  },
  shiftTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2
  },
  shiftRole: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 2
  },
  shiftDetails: {
    fontSize: 12,
    color: '#999'
  },
  deleteButton: {
    padding: 8
  },
  deleteButtonText: {
    fontSize: 20
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DDD'
  },
  saveButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold'
  }
});
