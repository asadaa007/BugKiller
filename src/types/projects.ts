import type { Bug } from './bugs';

export interface Project {
  id: string;
  name: string;
  slug: string; // URL-friendly slug
  shortDescription?: string;
  description: string;
  details: ProjectDetail[]; // Array of additional details
  owner: string;
  ownerName?: string;
  members: ProjectMember[];
  settings: ProjectSettings;
  status: 'active' | 'inactive' | 'on_hold' | 'discontinued' | 'complete';
  statusReason?: string | null;
  teamId?: string; // Legacy: single team assignment (for backward compatibility)
  teamIds?: string[]; // Assigned teams (supports multiple teams)
  teamLeadIds?: string[]; // Array of team lead user IDs
  bugs?: Bug[]; // Array of bugs for this project
  // Timeline fields
  startDate?: Date;
  expectedEndDate?: Date;
  duration?: string; // e.g., "2.5 months"
  // Technical details
  technologyStack?: string[]; // e.g., ["React", "TypeScript", "Firebase"]
  developmentEnvironment?: string[]; // e.g., ["Node.js v18+", "Vite Build Tool"]
  // Kanban columns customization
  customColumns?: KanbanColumn[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDetail {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMember {
  userId: string;
  role: 'owner' | 'manager' | 'team_lead' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}

export interface ProjectSettings {
  allowPublicAccess: boolean;
  requireApproval: boolean;
  autoAssign: boolean;
  defaultAssignee?: string;
  customFields: CustomField[];
}

export interface CustomField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'date' | 'boolean';
  required: boolean;
  options?: string[];
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  isDefault: boolean;
} 