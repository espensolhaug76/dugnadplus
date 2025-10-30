/**
 * Dugnad+ Coordinator Service
 * Core functionality for dugnadsansvarlig (volunteer coordinator)
 * 
 * Features:
 * - Automatic shift assignment based on point system
 * - Season-long shift management
 * - Family tracking and oversight
 * - Escalation to substitute marketplace
 */

import { Database } from './types/supabase';

type Shift = Database['public']['Tables']['shifts']['Row'];
type Family = Database['public']['Tables']['families']['Row'];
type Assignment = Database['public']['Tables']['shift_assignments']['Row'];
type PointHistory = Database['public']['Tables']['point_history']['Row'];

interface ShiftTemplate {
  date: Date;
  startTime: string;
  endTime: string;
  role: 'kiosk' | 'ticket_sales' | 'setup' | 'cleanup' | 'baking' | 'transport';
  requiredPeople: number;
  pointValue: number;
}

interface FamilyWithPoints {
  familyId: string;
  familyName: string;
  basePoints: number;
  familyPoints: number;
  totalPoints: number;
  level: number;
  protectedGroup: boolean;
  assignedShifts: number;
}

interface AssignmentResult {
  success: boolean;
  assignments: Assignment[];
  unassignedShifts: Shift[];
  warnings: string[];
}

export class DugnadCoordinatorService {
  private readonly BUFFER_DAYS = 14; // 14-day buffer for swaps/substitutes
  private readonly PROTECTED_GROUPS = ['coach', 'coordinator', 'team_leader'];
  
  /**
   * Create shifts for entire season
   * Coordinator enters all shifts once, system handles distribution
   */
  async createSeasonShifts(
    teamId: string,
    shiftTemplates: ShiftTemplate[],
    coordinatorId: string
  ): Promise<{ shiftIds: string[]; message: string }> {
    try {
      const shifts = shiftTemplates.map(template => ({
        team_id: teamId,
        date: template.date.toISOString(),
        start_time: template.startTime,
        end_time: template.endTime,
        role: template.role,
        required_people: template.requiredPeople,
        point_value: template.pointValue,
        status: 'pending',
        created_by: coordinatorId,
        buffer_date: new Date(
          template.date.getTime() - this.BUFFER_DAYS * 24 * 60 * 60 * 1000
        ).toISOString()
      }));

      // Insert shifts to database
      // const { data, error } = await supabase.from('shifts').insert(shifts);
      
      return {
        shiftIds: [], // Would be populated from database
        message: `Successfully created ${shifts.length} shifts for the season`
      };
    } catch (error) {
      throw new Error(`Failed to create season shifts: ${error}`);
    }
  }

  /**
   * Automatic shift assignment algorithm
   * Priority: Lowest points first, respecting protected groups
   */
  async assignShiftsAutomatically(
    teamId: string,
    shiftDate?: Date
  ): Promise<AssignmentResult> {
    const warnings: string[] = [];
    
    try {
      // Get all pending shifts (optionally filtered by date)
      const pendingShifts = await this.getPendingShifts(teamId, shiftDate);
      
      // Get all families with their current point totals
      const families = await this.getFamiliesWithPoints(teamId);
      
      // Sort families by total points (lowest first)
      const sortedFamilies = this.sortFamiliesByPriority(families);
      
      const assignments: Assignment[] = [];
      const unassignedShifts: Shift[] = [];
      
      for (const shift of pendingShifts) {
        const assigned = await this.assignShift(
          shift,
          sortedFamilies,
          assignments
        );
        
        if (!assigned) {
          unassignedShifts.push(shift);
          warnings.push(
            `Unable to assign shift on ${shift.date} - consider marketplace`
          );
        }
      }
      
      // Save assignments to database
      if (assignments.length > 0) {
        // await supabase.from('shift_assignments').insert(assignments);
      }
      
      // Notify families of their assignments
      await this.notifyFamiliesOfAssignments(assignments);
      
      return {
        success: unassignedShifts.length === 0,
        assignments,
        unassignedShifts,
        warnings
      };
    } catch (error) {
      throw new Error(`Automatic assignment failed: ${error}`);
    }
  }

  /**
   * Get pending shifts that need assignment
   */
  private async getPendingShifts(
    teamId: string,
    shiftDate?: Date
  ): Promise<Shift[]> {
    // Mock implementation - would query database
    return [];
  }

  /**
   * Get families with current point calculations
   */
  private async getFamiliesWithPoints(teamId: string): Promise<FamilyWithPoints[]> {
    // This would query:
    // 1. Family base points (from roles, duties completed)
    // 2. Family transferable points (sibling bonuses)
    // 3. Calculate levels
    // 4. Check protected group status
    
    // Mock implementation
    return [];
  }

  /**
   * Sort families by assignment priority
   * Priority order:
   * 1. Not in protected group
   * 2. Lowest total points
   * 3. Fewer assigned shifts this season
   */
  private sortFamiliesByPriority(families: FamilyWithPoints[]): FamilyWithPoints[] {
    return families.sort((a, b) => {
      // Protected groups get lower priority (sorted to end)
      if (a.protectedGroup !== b.protectedGroup) {
        return a.protectedGroup ? 1 : -1;
      }
      
      // Then by total points (lowest first)
      if (a.totalPoints !== b.totalPoints) {
        return a.totalPoints - b.totalPoints;
      }
      
      // Then by number of assigned shifts (fewer first)
      return a.assignedShifts - b.assignedShifts;
    });
  }

  /**
   * Assign a specific shift to an eligible family
   */
  private async assignShift(
    shift: Shift,
    families: FamilyWithPoints[],
    existingAssignments: Assignment[]
  ): Promise<boolean> {
    // Find first eligible family that:
    // 1. Isn't already assigned to this shift
    // 2. Doesn't have conflicting shifts on same date
    // 3. Hasn't been assigned too many shifts already
    
    for (const family of families) {
      if (await this.canAssignToFamily(family, shift, existingAssignments)) {
        existingAssignments.push({
          shift_id: shift.id,
          family_id: family.familyId,
          status: 'assigned',
          assigned_date: new Date().toISOString(),
          notification_sent: false
        } as Assignment);
        
        family.assignedShifts++;
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if family can be assigned to shift
   */
  private async canAssignToFamily(
    family: FamilyWithPoints,
    shift: Shift,
    existingAssignments: Assignment[]
  ): Promise<boolean> {
    // Check if already assigned to this shift
    const alreadyAssigned = existingAssignments.some(
      a => a.family_id === family.familyId && a.shift_id === shift.id
    );
    
    if (alreadyAssigned) return false;
    
    // Check for conflicting shifts on same date
    // (would query database for family's other shifts on this date)
    
    // Check if family has been assigned too many shifts
    // Based on fair distribution algorithm
    
    return true;
  }

  /**
   * Send notifications to families about their assignments
   * Only notifies when action is needed (within buffer period)
   */
  private async notifyFamiliesOfAssignments(assignments: Assignment[]): Promise<void> {
    // Group assignments by family
    const familyAssignments = new Map<string, Assignment[]>();
    
    for (const assignment of assignments) {
      const familyId = assignment.family_id;
      if (!familyAssignments.has(familyId)) {
        familyAssignments.set(familyId, []);
      }
      familyAssignments.get(familyId)?.push(assignment);
    }
    
    // Send push notifications
    for (const [familyId, familyShifts] of familyAssignments) {
      // await this.sendPushNotification(familyId, {
      //   title: 'Nye dugnader tildelt',
      //   body: `Du har ${familyShifts.length} nye dugnader. Sjekk appen for detaljer.`,
      //   data: { type: 'shift_assignment', count: familyShifts.length }
      // });
    }
  }

  /**
   * Get coordinator dashboard overview
   * Shows who owes time/money and overall status
   */
  async getCoordinatorDashboard(teamId: string): Promise<{
    totalShifts: number;
    assignedShifts: number;
    pendingShifts: number;
    completedShifts: number;
    familiesNeedingFollowup: FamilyStatus[];
    upcomingIssues: IssueAlert[];
  }> {
    // Aggregate data for coordinator view
    return {
      totalShifts: 0,
      assignedShifts: 0,
      pendingShifts: 0,
      completedShifts: 0,
      familiesNeedingFollowup: [],
      upcomingIssues: []
    };
  }

  /**
   * Escalate unassigned shift to marketplace
   * Called when buffer period expires without coverage
   */
  async escalateToMarketplace(shiftId: string): Promise<void> {
    // 1. Mark shift as needing substitute
    // 2. Calculate suggested payment based on similar shifts
    // 3. Notify all registered substitutes
    // 4. Create marketplace listing
    
    console.log(`Shift ${shiftId} escalated to marketplace`);
  }

  /**
   * Handle shift swap requests between families
   */
  async processShiftSwap(
    originalAssignmentId: string,
    requestingFamilyId: string,
    targetFamilyId: string
  ): Promise<{ success: boolean; message: string }> {
    // 1. Verify both families consent
    // 2. Check if swap is fair (point-wise)
    // 3. Update assignments
    // 4. Notify both families
    
    return {
      success: true,
      message: 'Shift swap completed successfully'
    };
  }
}

interface FamilyStatus {
  familyId: string;
  familyName: string;
  owedHours: number;
  owedAmount: number;
  missedShifts: number;
  status: 'ok' | 'warning' | 'critical';
}

interface IssueAlert {
  type: 'unassigned' | 'no_show' | 'late_swap' | 'marketplace_needed';
  shiftId: string;
  date: Date;
  severity: 'low' | 'medium' | 'high';
  message: string;
}
