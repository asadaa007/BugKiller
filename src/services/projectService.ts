import { 
  collection, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Project } from '../types/projects';
import { slugify, generateUniqueSlug } from '../utils/slugify';

const PROJECTS_COLLECTION = 'projects';

// Generate sequential project ID (e.g., #1, #2, #3, etc.)
const generateProjectId = async (): Promise<string> => {
  try {
    // Get all existing projects
    const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
    
    // Find the highest project number from existing projects
    let maxProjectNumber = 0;
    querySnapshot.docs.forEach((doc) => {
      const projectData = doc.data();
      // Extract number from ID format like "#1", "#2", etc.
      const idMatch = projectData.id?.match(/#(\d+)$/);
      if (idMatch) {
        const projectNumber = parseInt(idMatch[1]);
        if (projectNumber > maxProjectNumber) {
          maxProjectNumber = projectNumber;
        }
      }
    });
    
    // Return next project number with # prefix
    return `#${maxProjectNumber + 1}`;
  } catch (error) {
    console.error('Error generating project ID:', error);
    // Fallback to timestamp-based ID
    return `#${Date.now()}`;
  }
};

// Generate unique slug for a project
const generateUniqueProjectSlug = async (projectName: string): Promise<string> => {
  try {
    // Get all existing projects to check for existing slugs
    const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
    
    // Extract existing slugs
    const existingSlugs: string[] = [];
    querySnapshot.docs.forEach((doc) => {
      const projectData = doc.data();
      if (projectData.slug) {
        existingSlugs.push(projectData.slug);
      }
    });
    
    // Generate base slug from project name
    const baseSlug = slugify(projectName);
    
    // Generate unique slug
    return generateUniqueSlug(baseSlug, existingSlugs);
  } catch (error) {
    console.error('Error generating project slug:', error);
    // Fallback to timestamp-based slug
    return `project-${Date.now()}`;
  }
};

export const projectService = {
  // Create a new project
  async createProject(projectData: Omit<Project, 'id' | 'slug' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      // Generate sequential project ID
      const projectId = await generateProjectId();
      
      // Generate unique slug from project name
      const slug = await generateUniqueProjectSlug(projectData.name);
      
      // Create the project document with the custom ID
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await setDoc(projectRef, {
        id: projectId,
        slug,
        ...projectData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      return projectId;
    } catch (error) {
      console.error('Error creating project:', error);
      throw new Error('Failed to create project');
    }
  },

  // Get all projects
  async getProjects(): Promise<Project[]> {
    try {
      const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id || doc.id, // Use the stored id field if available, fallback to doc.id
          ...data,
          startDate: data.startDate && data.startDate.toDate ? data.startDate.toDate() : data.startDate,
          expectedEndDate: data.expectedEndDate && data.expectedEndDate.toDate ? data.expectedEndDate.toDate() : data.expectedEndDate,
          technologyStack: data.technologyStack || [],
          developmentEnvironment: data.developmentEnvironment || [],
          customColumns: data.customColumns || [],
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      }) as Project[];
    } catch (error) {
      console.error('Error getting projects:', error);
      throw new Error('Failed to get projects');
    }
  },

  // Get project by ID
  async getProjectById(id: string): Promise<Project | null> {
    try {
      const docRef = doc(db, PROJECTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: data.id || docSnap.id, // Use the stored id field if available, fallback to doc.id
          ...data,
          startDate: data.startDate && data.startDate.toDate ? data.startDate.toDate() : data.startDate,
          expectedEndDate: data.expectedEndDate && data.expectedEndDate.toDate ? data.expectedEndDate.toDate() : data.expectedEndDate,
          technologyStack: data.technologyStack || [],
          developmentEnvironment: data.developmentEnvironment || [],
          customColumns: data.customColumns || [],
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as Project;
      }
      return null;
    } catch (error) {
      console.error('Error getting project:', error);
      throw new Error('Failed to get project');
    }
  },

  // Get project by slug
  async getProjectBySlug(slug: string): Promise<Project | null> {
    try {
      const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
      
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        if (data.slug === slug) {
          return {
            id: data.id || doc.id,
            ...data,
            startDate: data.startDate && data.startDate.toDate ? data.startDate.toDate() : data.startDate,
            expectedEndDate: data.expectedEndDate && data.expectedEndDate.toDate ? data.expectedEndDate.toDate() : data.expectedEndDate,
            technologyStack: data.technologyStack || [],
            developmentEnvironment: data.developmentEnvironment || [],
            customColumns: data.customColumns || [],
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date()
          } as Project;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting project by slug:', error);
      throw new Error('Failed to get project by slug');
    }
  },

  // Update project
  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    try {
      const docRef = doc(db, PROJECTS_COLLECTION, id);
      
      // If the name is being updated, generate a new slug
      if (updates.name) {
        const newSlug = await generateUniqueProjectSlug(updates.name);
        await updateDoc(docRef, {
          ...updates,
          slug: newSlug,
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating project:', error);
      throw new Error('Failed to update project');
    }
  },

  // Delete project
  async deleteProject(id: string): Promise<void> {
    try {
      const docRef = doc(db, PROJECTS_COLLECTION, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting project:', error);
      throw new Error('Failed to delete project');
    }
  },

  // Get projects by team ID (supports both legacy teamId and new teamIds array)
  async getProjectsByTeam(teamId: string): Promise<Project[]> {
    try {
      const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
      const allProjects = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id || doc.id, // Use the stored id field if available, fallback to doc.id
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      }) as Project[];
      
      // Filter projects assigned to the specified team
      // Support both legacy teamId and new teamIds array
      return allProjects.filter(project => 
        project.teamId === teamId || 
        (project.teamIds && project.teamIds.includes(teamId))
      );
    } catch (error) {
      console.error('Error getting projects by team:', error);
      throw new Error('Failed to get projects by team');
    }
  },

  // Get projects by user (and optionally by user's team)
  async getProjectsByUser(userId: string, teamId?: string): Promise<Project[]> {
    try {
      // Get all projects and filter in application layer to avoid index requirements
      const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
      const allProjects = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id || doc.id, // Use the stored id field if available, fallback to doc.id
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      }) as Project[];
      
      // Filter projects where user is a member/owner, or project assigned to their team
      const userProjects = allProjects.filter(project => 
        project.members?.some(member => member.userId === userId) || 
        project.owner === userId ||
        (!!teamId && project.teamId === teamId)
      );
      
      // Sort by creation date (newest first)
      return userProjects.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Error getting projects by user:', error);
      throw new Error('Failed to get projects by user');
    }
  },

  // Fix existing projects that don't have slugs
  async fixProjectSlugs(): Promise<void> {
    try {
      const querySnapshot = await getDocs(collection(db, PROJECTS_COLLECTION));
      const projectsToUpdate: { id: string; name: string; slug?: string }[] = [];
      
      // Find projects without slugs
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!data.slug && data.name) {
          projectsToUpdate.push({
            id: data.id || doc.id,
            name: data.name,
            slug: data.slug
          });
        }
      });
      
      // Get all existing slugs to avoid duplicates
      const existingSlugs: string[] = [];
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.slug) {
          existingSlugs.push(data.slug);
        }
      });
      
      // Update projects with missing slugs
      for (const project of projectsToUpdate) {
        const newSlug = generateUniqueSlug(slugify(project.name), existingSlugs);
        existingSlugs.push(newSlug); // Add to existing slugs to avoid duplicates in batch
        
        const docRef = doc(db, PROJECTS_COLLECTION, project.id);
        await updateDoc(docRef, {
          slug: newSlug,
          updatedAt: serverTimestamp()
        });
        
        console.log(`Fixed slug for project "${project.name}": ${newSlug}`);
      }
      
      console.log(`Fixed slugs for ${projectsToUpdate.length} projects`);
    } catch (error) {
      console.error('Error fixing project slugs:', error);
      throw new Error('Failed to fix project slugs');
    }
  }
};