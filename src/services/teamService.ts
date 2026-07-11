import { db } from '../firebase/config';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy,
  arrayUnion,
  arrayRemove 
} from 'firebase/firestore';
import type { Team, TeamWithDetails, AppUser } from '../types/auth';
import { projectService } from './projectService';
import { slugify, generateUniqueSlug } from '../utils/slugify';

const TEAMS_COLLECTION = 'teams';
const USERS_COLLECTION = 'users';

export interface CreateTeamData {
  name: string;
  description?: string;
  managerId: string;
  teamLeadIds?: string[];
}

export interface AddMemberData {
  teamId: string;
  userId: string;
}

export interface TeamPerformance {
  totalBugs: number;
  resolvedBugs: number;
  openBugs: number;
  resolutionRate: number;
  avgResolutionTime: number;
  projectCount: number;
  memberCount: number;
}

// Create a new team
export const createTeam = async (teamData: CreateTeamData): Promise<string> => {
  try {
    const members = [teamData.managerId]; // Manager is automatically a member
    
    // Add team leads if provided
    if (teamData.teamLeadIds && teamData.teamLeadIds.length > 0) {
      teamData.teamLeadIds.forEach(teamLeadId => {
        if (teamLeadId !== teamData.managerId && !members.includes(teamLeadId)) {
          members.push(teamLeadId);
        }
      });
    }

    // Generate unique slug
    const baseSlug = slugify(teamData.name);
    const allTeams = await getAllTeams();
    const existingSlugs = allTeams.map(t => t.slug || '').filter(Boolean);
    const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

    const teamDoc = await addDoc(collection(db, TEAMS_COLLECTION), {
      ...teamData,
      slug: uniqueSlug,
      members,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update the manager's managedTeams array
    const managerRef = doc(db, USERS_COLLECTION, teamData.managerId);
    await updateDoc(managerRef, {
      managedTeams: arrayUnion(teamDoc.id),
      teamId: teamDoc.id, // Manager belongs to their own team
    });

    // Update team leads' teamId if provided
    if (teamData.teamLeadIds && teamData.teamLeadIds.length > 0) {
      for (const teamLeadId of teamData.teamLeadIds) {
        if (teamLeadId !== teamData.managerId) {
          const teamLeadRef = doc(db, USERS_COLLECTION, teamLeadId);
          await updateDoc(teamLeadRef, {
            teamId: teamDoc.id,
            updatedAt: new Date(),
          });
        }
      }
    }

    return teamDoc.id;
  } catch (error) {
    console.error('Error creating team:', error);
    throw new Error('Failed to create team');
  }
};

// Get all teams (for super admin)
export const getAllTeams = async (): Promise<Team[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, TEAMS_COLLECTION));
    const teams = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Team[];
    
    // Sync team members from users collection
    const syncedTeams = await Promise.all(teams.map(async (team) => {
      // Get all users that belong to this team
      const usersQuery = query(
        collection(db, USERS_COLLECTION),
        where('teamId', '==', team.id)
      );
      const usersSnapshot = await getDocs(usersQuery);
      const teamMemberIds = usersSnapshot.docs.map(userDoc => userDoc.id);
      
      // Update team with synced members if different
      if (JSON.stringify(team.members?.sort()) !== JSON.stringify(teamMemberIds.sort())) {
        await updateDoc(doc(db, TEAMS_COLLECTION, team.id), {
          members: teamMemberIds,
          updatedAt: new Date()
        });
        team.members = teamMemberIds;
      }
      
      return team;
    }));
    
    return syncedTeams;
  } catch (error) {
    console.error('Error getting teams:', error);
    throw new Error('Failed to get teams');
  }
};

// Get teams managed by a specific manager
export const getTeamsByManager = async (managerId: string): Promise<Team[]> => {
  try {
    const q = query(
      collection(db, TEAMS_COLLECTION),
      where('managerId', '==', managerId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const teams = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Team[];
    
    // Sync team members from users collection
    const syncedTeams = await Promise.all(teams.map(async (team) => {
      // Get all users that belong to this team
      const usersQuery = query(
        collection(db, USERS_COLLECTION),
        where('teamId', '==', team.id)
      );
      const usersSnapshot = await getDocs(usersQuery);
      const teamMemberIds = usersSnapshot.docs.map(userDoc => userDoc.id);
      
      // Update team with synced members if different
      if (JSON.stringify(team.members?.sort()) !== JSON.stringify(teamMemberIds.sort())) {
        await updateDoc(doc(db, TEAMS_COLLECTION, team.id), {
          members: teamMemberIds,
          updatedAt: new Date()
        });
        team.members = teamMemberIds;
      }
      
      return team;
    }));
    
    return syncedTeams;
  } catch (error: unknown) {
    console.error('Error getting manager teams with index query:', error);
    
    // Fallback: Get all teams and filter client-side if index is not ready
    const errorObj = error as { code?: string; message?: string };
    if (errorObj.code === 'failed-precondition' || errorObj.message?.includes('index')) {
      try {
        const allTeams = await getAllTeams();
        const managerTeams = allTeams.filter(team => team.managerId === managerId);
        return managerTeams;
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
        throw new Error('Failed to get manager teams');
      }
    }
    
    throw new Error('Failed to get manager teams');
  }
};

// Get teams led by a specific team lead
export const getTeamsByTeamLead = async (teamLeadId: string): Promise<Team[]> => {
  try {
    const q = query(
      collection(db, TEAMS_COLLECTION),
      where('teamLeadIds', 'array-contains', teamLeadId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const teams = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Team[];
    
    // Sync team members from users collection
    const syncedTeams = await Promise.all(teams.map(async (team) => {
      // Get all users that belong to this team
      const usersQuery = query(
        collection(db, USERS_COLLECTION),
        where('teamId', '==', team.id)
      );
      const usersSnapshot = await getDocs(usersQuery);
      const teamMemberIds = usersSnapshot.docs.map(userDoc => userDoc.id);
      
      // Update team with synced members if different
      if (JSON.stringify(team.members?.sort()) !== JSON.stringify(teamMemberIds.sort())) {
        await updateDoc(doc(db, TEAMS_COLLECTION, team.id), {
          members: teamMemberIds,
          updatedAt: new Date()
        });
        team.members = teamMemberIds;
      }
      
      return team;
    }));
    
    return syncedTeams;
  } catch (error: unknown) {
    console.error('Error getting team lead teams with index query:', error);
    
    // Fallback: Get all teams and filter client-side if index is not ready
    const errorObj = error as { code?: string; message?: string };
    if (errorObj.code === 'failed-precondition' || errorObj.message?.includes('index')) {
      try {
        const allTeams = await getAllTeams();
        const teamLeadTeams = allTeams.filter(team => team.teamLeadIds?.includes(teamLeadId));
        return teamLeadTeams;
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
        throw new Error('Failed to get team lead teams');
      }
    }
    
    throw new Error('Failed to get team lead teams');
  }
};

// Get team by ID
export const getTeamById = async (teamId: string): Promise<Team | null> => {
  try {
    const teamDoc = await getDoc(doc(db, TEAMS_COLLECTION, teamId));
    if (teamDoc.exists()) {
      return {
        id: teamDoc.id,
        ...teamDoc.data(),
        createdAt: teamDoc.data().createdAt?.toDate() || new Date(),
        updatedAt: teamDoc.data().updatedAt?.toDate() || new Date(),
      } as Team;
    }
    return null;
  } catch (error) {
    console.error('Error getting team:', error);
    throw new Error('Failed to get team');
  }
};

// Get team by slug
export const getTeamBySlug = async (slug: string): Promise<Team | null> => {
  try {
    const q = query(
      collection(db, TEAMS_COLLECTION),
      where('slug', '==', slug)
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const teamDoc = querySnapshot.docs[0];
      return {
        id: teamDoc.id,
        ...teamDoc.data(),
        createdAt: teamDoc.data().createdAt?.toDate() || new Date(),
        updatedAt: teamDoc.data().updatedAt?.toDate() || new Date(),
      } as Team;
    }
    return null;
  } catch (error) {
    console.error('Error getting team by slug:', error);
    throw new Error('Failed to get team by slug');
  }
};

// Get team with detailed information
export const getTeamWithDetails = async (teamId: string): Promise<TeamWithDetails | null> => {
  try {
    const team = await getTeamById(teamId);
    if (!team) return null;

    // Get manager details
    const managerDoc = await getDoc(doc(db, USERS_COLLECTION, team.managerId));
    const manager = managerDoc.exists() ? {
      id: managerDoc.id,
      ...managerDoc.data(),
      createdAt: managerDoc.data().createdAt?.toDate() || new Date(),
      updatedAt: managerDoc.data().updatedAt?.toDate() || new Date(),
    } as AppUser : null;

    // Get member details
    const memberDetails: AppUser[] = [];
    for (const memberId of team.members) {
      const memberDoc = await getDoc(doc(db, USERS_COLLECTION, memberId));
      if (memberDoc.exists()) {
        memberDetails.push({
          id: memberDoc.id,
          ...memberDoc.data(),
          createdAt: memberDoc.data().createdAt?.toDate() || new Date(),
          updatedAt: memberDoc.data().updatedAt?.toDate() || new Date(),
        } as AppUser);
      }
    }

    // Get project count for this team
    const teamProjects = await projectService.getProjectsByTeam(teamId);
    const projectCount = teamProjects.length;

    // Get bug count (you'll need to implement this based on your bug structure)
    const bugCount = 0; // TODO: Implement bug counting

    // Calculate performance metrics
    const performance = {
      totalBugs: bugCount,
      resolvedBugs: 0, // TODO: Implement
      openBugs: 0, // TODO: Implement
      resolutionRate: 0, // TODO: Implement
      avgResolutionTime: 0, // TODO: Implement
    };

    return {
      ...team,
      manager: manager!,
      memberDetails,
      projectCount,
      bugCount,
      performance,
    };
  } catch (error) {
    console.error('Error getting team details:', error);
    throw new Error('Failed to get team details');
  }
};

// Add member to team
export const addMemberToTeam = async (teamId: string, userId: string): Promise<void> => {
  try {
    // Update team members
    const teamRef = doc(db, TEAMS_COLLECTION, teamId);
    await updateDoc(teamRef, {
      members: arrayUnion(userId),
      updatedAt: new Date(),
    });

    // Update user's teamId
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      teamId,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error adding member to team:', error);
    throw new Error('Failed to add member to team');
  }
};

// Remove member from team
export const removeMemberFromTeam = async (teamId: string, userId: string): Promise<void> => {
  try {
    // Update team members
    const teamRef = doc(db, TEAMS_COLLECTION, teamId);
    await updateDoc(teamRef, {
      members: arrayRemove(userId),
      updatedAt: new Date(),
    });

    // Update user's teamId
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      teamId: null,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error removing member from team:', error);
    throw new Error('Failed to remove member from team');
  }
};

// Update team
export const updateTeam = async (teamId: string, updates: Partial<Team>): Promise<void> => {
  try {
    const teamRef = doc(db, TEAMS_COLLECTION, teamId);
    
    // Filter out undefined values to prevent Firestore errors
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    
    await updateDoc(teamRef, {
      ...cleanUpdates,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating team:', error);
    throw new Error('Failed to update team');
  }
};

// Delete team
export const deleteTeam = async (teamId: string): Promise<void> => {
  try {
    // Get team to remove from manager's managedTeams
    const team = await getTeamById(teamId);
    if (team) {
      const managerRef = doc(db, USERS_COLLECTION, team.managerId);
      await updateDoc(managerRef, {
        managedTeams: arrayRemove(teamId),
        updatedAt: new Date(),
      });

      // Remove teamId from all members
      for (const memberId of team.members) {
        const memberRef = doc(db, USERS_COLLECTION, memberId);
        await updateDoc(memberRef, {
          teamId: null,
          updatedAt: new Date(),
        });
      }
    }

    // Delete the team
    await deleteDoc(doc(db, TEAMS_COLLECTION, teamId));
  } catch (error) {
    console.error('Error deleting team:', error);
    throw new Error('Failed to delete team');
  }
};

// Get team performance metrics
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getTeamPerformance = async (_teamId: string): Promise<TeamPerformance> => {
  try {
    // TODO: Implement actual performance calculation based on your bug/project data
    // This is a placeholder implementation
    return {
      totalBugs: 0,
      resolvedBugs: 0,
      openBugs: 0,
      resolutionRate: 0,
      avgResolutionTime: 0,
      projectCount: 0,
      memberCount: 0,
    };
  } catch (error) {
    console.error('Error getting team performance:', error);
    throw new Error('Failed to get team performance');
  }
};
