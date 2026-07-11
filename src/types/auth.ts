export type UserRole = 'super_admin' | 'manager' | 'team_lead' | 'team_member';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  teamId?: string; // For team members and managers
  managedTeams?: string[]; // For managers - teams they manage
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  name: string;
  slug?: string; // URL-friendly slug
  description?: string;
  managerId: string; // User ID of the team manager
  teamLeadIds?: string[]; // Array of team lead user IDs
  members: string[]; // Array of user IDs
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamWithDetails extends Team {
  manager: AppUser;
  memberDetails: AppUser[];
  projectCount: number;
  bugCount: number;
  performance: {
    totalBugs: number;
    resolvedBugs: number;
    openBugs: number;
    resolutionRate: number;
    avgResolutionTime: number;
  };
}

export interface CreateTeamData {
  name: string;
  description?: string;
  managerId: string;
  teamLeadIds?: string[];
}

export interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

// Permission types
export interface Permissions {
  canViewAllTeams: boolean;
  canViewAllManagers: boolean;
  canCreateTeams: boolean;
  canAddTeamMembers: boolean;
  canCreateProjects: boolean;
  canViewAllProjects: boolean;
  canViewAllBugs: boolean;
  canViewTeamPerformance: boolean;
  canViewAllPerformance: boolean;
  canManageUsers: boolean;
}

// Role-based permissions mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permissions> = {
  super_admin: {
    canViewAllTeams: true,
    canViewAllManagers: true,
    canCreateTeams: true,
    canAddTeamMembers: true,
    canCreateProjects: true,
    canViewAllProjects: true,
    canViewAllBugs: true,
    canViewTeamPerformance: true,
    canViewAllPerformance: true,
    canManageUsers: true,
  },
  manager: {
    canViewAllTeams: false,
    canViewAllManagers: false,
    canCreateTeams: true,
    canAddTeamMembers: true,
    canCreateProjects: true,
    canViewAllProjects: true,
    canViewAllBugs: true,
    canViewTeamPerformance: true,
    canViewAllPerformance: false,
    canManageUsers: false,
  },
  team_lead: {
    canViewAllTeams: false,
    canViewAllManagers: false,
    canCreateTeams: false,
    canAddTeamMembers: false,
    canCreateProjects: true,
    canViewAllProjects: false,
    canViewAllBugs: true,
    canViewTeamPerformance: true,
    canViewAllPerformance: false,
    canManageUsers: false,
  },
  team_member: {
    canViewAllTeams: false,
    canViewAllManagers: false,
    canCreateTeams: false,
    canAddTeamMembers: false,
    canCreateProjects: false,
    canViewAllProjects: false,
    canViewAllBugs: false,
    canViewTeamPerformance: false,
    canViewAllPerformance: false,
    canManageUsers: false,
  },
}; 