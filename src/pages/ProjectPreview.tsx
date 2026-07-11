import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjects } from '../context/ProjectContext';
import { useBugs } from '../context/BugContext';
import { useAuth } from '../context/AuthContext';
import { useTeams } from '../context/TeamContext';
import Navigation from '../components/layout/Navigation';
import BreadcrumbNew from '../components/common/BreadcrumbNew';
import Loading from '../components/common/Loading';
import { projectService } from '../services/projectService';
import { 
  ArrowLeft,
  Calendar,
  Bug,
  CheckCircle,
  AlertCircle,
  Edit,
  Plus,
  Target
} from 'lucide-react';
import { Button, LinkButton } from '../components/common/buttons';
import MarkdownRenderer from '../components/common/MarkdownRenderer';
import { getUserById } from '../services/userService';
import { getTeamById } from '../services/teamService';
import type { Project, ProjectDetail } from '../types/projects';

const ProjectPreview = () => {
  const { projectId: rawProjectId, slug } = useParams<{ projectId?: string; slug?: string }>();
  
  // Decode the projectId if it was URL encoded
  const projectId = rawProjectId ? decodeURIComponent(rawProjectId) : undefined;
  const navigate = useNavigate();
  const { projects, loading: projectsLoading } = useProjects();
  const { bugs, loading: bugsLoading } = useBugs();
  const { user } = useAuth();
  const { teams } = useTeams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<ProjectDetail | null>(null);

  // Role-based permissions
  const canManageProject = user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'team_lead';
  
  // Role-based permissions: allow super_admin/manager/team_lead; allow team_member only if QC/QA team
  const canCreateBug = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'manager' || user.role === 'team_lead') return true;
    if (user.role === 'team_member') {
      const team = user.teamId ? teams.find(t => t.id === user.teamId) : undefined;
      if (team?.name) {
        const name = team.name.toLowerCase();
        return name.includes('qa') || name.includes('qc') || name.includes('quality');
      }
    }
    return false;
  }, [user, teams]);

  const [teamName, setTeamName] = useState<string>('Loading...');
  const [managerName, setManagerName] = useState<string>('-');
  const [teamLeadName, setTeamLeadName] = useState<string>('-');
  const [memberDetails, setMemberDetails] = useState<Record<string, { name: string; role: string }>>({});

  // Find project by ID or slug
  useEffect(() => {
    const findProject = async () => {
      setLoading(true);
      try {
        let foundProject = null;
        
        if (projectId) {
          // Try to find by ID first
          foundProject = projects.find(p => p.id === projectId);
          if (!foundProject) {
            // If not found in context, try to fetch from service
            foundProject = await projectService.getProjectById(projectId);
          }
        } else if (slug) {
          // Try to find by slug
          foundProject = projects.find(p => p.slug === slug);
          if (!foundProject) {
            // If not found in context, try to fetch from service
            foundProject = await projectService.getProjectBySlug(slug);
          }
        }
        
        setProject(foundProject);
        // Set selectedDetail to null by default to show project description
        setSelectedDetail(null);
      } catch (error) {
        console.error('Error finding project:', error);
        setProject(null);
      } finally {
        setLoading(false);
      }
    };

    if (projects.length > 0 || projectId || slug) {
      findProject();
    }
  }, [projectId, slug, projects]);

  // Filter bugs for this project
  const projectBugs = bugs.filter(bug => bug.projectId === project?.id);

  // Calculate bug statistics
  const bugStats = useMemo(() => {
    const total = projectBugs.length;
    const open = projectBugs.filter(bug => ['new', 'in-progress', 'revision'].includes(bug.status)).length;
    const resolved = projectBugs.filter(bug => bug.status === 'completed').length;
    const critical = projectBugs.filter(bug => bug.priority === 'critical').length;
    const progressPercentage = total > 0 ? Math.round((resolved / total) * 100) : 0;

    return { total, open, resolved, critical, progressPercentage };
  }, [projectBugs]);

  // Load team and member details
  useEffect(() => {
    const loadProjectDetails = async () => {
      if (!project) return;

      try {
        // Load team details
        if (project.teamId) {
          const team = teams.find(t => t.id === project.teamId) || await getTeamById(project.teamId);
          if (team) {
            setTeamName(team.name);

            // Load manager
            if (team.managerId) {
              const manager = await getUserById(team.managerId);
              setManagerName(manager?.name || '-');
            }

            // Load team lead
            if (team.teamLeadIds && team.teamLeadIds.length > 0) {
              const teamLead = await getUserById(team.teamLeadIds[0]);
              setTeamLeadName(teamLead?.name || '-');
            }

            // Load member details
            if (team.members && team.members.length > 0) {
              const memberPromises = team.members.map(async (memberId) => {
                const member = await getUserById(memberId);
                return { [memberId]: { name: member?.name || 'Unknown', role: 'team_member' } };
              });
              const memberResults = await Promise.all(memberPromises);
              const memberDetailsObj = Object.assign({}, ...memberResults);
              setMemberDetails(memberDetailsObj);
            }
          }
        } else {
          setTeamName('No Team Assigned');
        }
      } catch (error) {
        console.error('Error loading project details:', error);
      }
    };

    loadProjectDetails();
  }, [project, teams]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800';
      case 'on_hold':
        return 'bg-orange-100 text-orange-800';
      case 'discontinued':
        return 'bg-red-100 text-red-800';
      case 'complete':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };


  if (loading || projectsLoading || bugsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading size="lg" text="Loading project details..." />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Project Not Found</h1>
            <p className="text-gray-600 mb-6">The project you're looking for doesn't exist or has been removed.</p>
            <Button
              onClick={() => navigate('/projects')}
              variant="primary"
              icon={ArrowLeft}
            >
              Back to Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <BreadcrumbNew 
          items={[
            { label: 'Projects', href: '/projects' },
            { label: project.name }
          ]}
          showBackButton={false}
        />

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          {/* Top Section - Project Title and Actions */}
          <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(project.status)}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              {project.shortDescription && (
                  <p className="text-lg text-gray-600 mb-4">{project.shortDescription}</p>
              )}
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="w-4 h-4 mr-2" />
                Created on {project.createdAt.toLocaleDateString()}
                {project.updatedAt && (
                  <>
                    <span className="mx-2">•</span>
                    Last updated {project.updatedAt.toLocaleDateString()}
                  </>
                )}
              </div>
            </div>
              
              {/* Action Buttons */}
              <div className="flex flex-col items-end space-y-3 ml-6">
              <Button
                onClick={() => navigate(`/bugs?project=${project.slug}`)}
                variant="outline"
                icon={Bug}
              >
                View Bugs
              </Button>
              {canCreateBug && (
                <Button
                  onClick={() => navigate(`/p/${project.slug}?newBug=1`)}
                  variant="primary"
                  icon={Plus}
                >
                  Create Bug
                </Button>
              )}
              {canManageProject && (
                <Button
                  onClick={() => navigate(`/p/${project.slug}/edit`)}
                  variant="secondary"
                  icon={Edit}
                >
                  Edit Project
                </Button>
              )}
              </div>
            </div>
          </div>

          {/* Bottom Section - Project Information Cards */}
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Timeline - Visible to Admin, Manager, and Team Lead only */}
              {(user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'team_lead') && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <Target className="w-4 h-4 mr-2" />
                    Project Timeline
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <div className="text-blue-600 text-xs font-medium mb-1">Start Date</div>
                      <div className="text-blue-900 text-sm font-semibold">
                        {project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Not set'}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                      <div className="text-green-600 text-xs font-medium mb-1">Expected End</div>
                      <div className="text-green-900 text-sm font-semibold">
                        {project.expectedEndDate ? new Date(project.expectedEndDate).toLocaleDateString() : 'Not set'}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                      <div className="text-purple-600 text-xs font-medium mb-1">Duration</div>
                      <div className="text-purple-900 text-sm font-semibold">
                        {project.duration || 'Not set'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Project Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Project Status
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Current Status</span>
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(project.status)}`}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                  {(project.status === 'discontinued' || project.status === 'on_hold') && project.statusReason && (
                    <div className="mt-3">
                      <span className="text-sm text-gray-600 block mb-2">Status Reason</span>
                      <p className="text-sm text-gray-900 bg-white p-3 rounded-lg border border-gray-200">
                        {project.statusReason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bug className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Bugs</p>
                <p className="text-2xl font-bold text-gray-900">{bugStats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Open Bugs</p>
                <p className="text-2xl font-bold text-gray-900">{bugStats.open}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Resolved</p>
                <p className="text-2xl font-bold text-gray-900">{bugStats.resolved}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <Target className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Critical</p>
                <p className="text-2xl font-bold text-gray-900">{bugStats.critical}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Progress</h3>
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>Bug Resolution Progress</span>
            <span>{bugStats.progressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-primary h-3 rounded-full transition-all duration-300"
              style={{ width: `${bugStats.progressPercentage}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Team Information */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Assigned Team</label>
                  <p className="text-gray-900">{teamName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Manager</label>
                  <p className="text-gray-900">{managerName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Team Lead</label>
                  <p className="text-gray-900">{teamLeadName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Team Members</label>
                  <p className="text-gray-900">{Object.keys(memberDetails).length}</p>
                </div>
              </div>
            </div>


            {/* Project Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Settings</h3>
              <div className="space-y-4">
                {/* Basic Settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Public Access</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${project.settings.allowPublicAccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {project.settings.allowPublicAccess ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Require Approval</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${project.settings.requireApproval ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {project.settings.requireApproval ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Auto Assign</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${project.settings.autoAssign ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {project.settings.autoAssign ? 'Enabled' : 'Disabled'}
                  </span>
            </div>
          </div>

                {/* Technical Details */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Technical Details</h4>
                  <div className="space-y-4">
                        <div>
                      <label className="text-xs font-medium text-gray-600 block mb-2">Technology Stack</label>
                      <div className="flex flex-wrap gap-1">
                        {project.technologyStack && project.technologyStack.length > 0 ? (
                          project.technologyStack.map((tech, index) => (
                            <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                              {tech}
                        </span>
                          ))
                        ) : (
                          <span className="text-gray-500 text-xs">No technologies specified</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-2">Development Environment</label>
                      <div className="flex flex-wrap gap-1">
                        {project.developmentEnvironment && project.developmentEnvironment.length > 0 ? (
                          project.developmentEnvironment.map((env, index) => (
                            <span key={index} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                              {env}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500 text-xs">No environment specified</span>
              )}
            </div>
                    </div>
                    </div>
                  </div>
                </div>
              </div>

            {/* Additional Files Links */}
            {project.details && project.details.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Files</h3>
                <div className="space-y-2">
                  <LinkButton
                    onClick={() => setSelectedDetail(null)}
                    variant={selectedDetail === null ? "primary" : "ghost"}
                    className="w-full justify-start"
                  >
                    Project Description
                  </LinkButton>
                  {project.details
                    .sort((a, b) => a.order - b.order)
                    .map((detail) => (
                      <LinkButton
                        key={detail.id}
                        onClick={() => setSelectedDetail(detail)}
                        variant={selectedDetail?.id === detail.id ? "primary" : "ghost"}
                        className="w-full justify-start"
                      >
                        {detail.title || 'Untitled Detail'}
                      </LinkButton>
                    ))}
                </div>
              </div>
            )}
              </div>

          {/* Right Side Content - Project Details and Description */}
          <div className="lg:col-span-3">
            {/* Dynamic Content - Description or Selected Detail */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-400 mb-4 border-b border-gray-200 pb-2">
                {selectedDetail ? selectedDetail.title : 'Project Description'}
              </h2>
              <MarkdownRenderer 
                content={selectedDetail ? selectedDetail.content : project.description} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectPreview;
