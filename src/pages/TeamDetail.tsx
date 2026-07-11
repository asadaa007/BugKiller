import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Calendar, Bug, CheckCircle, Folder, User, UserCheck, ArrowLeft } from 'lucide-react';
import type { Team } from '../types/auth';
import type { Project } from '../types/projects';
import { projectService } from '../services/projectService';
import { getUserDetailsByIds, getUserNamesByIds } from '../services/userService';
import { getTeamById, getTeamBySlug } from '../services/teamService';
import { useTeams } from '../context/TeamContext';
import { useBugs } from '../context/BugContext';
import Navigation from '../components/layout/Navigation';
import BreadcrumbNew from '../components/common/BreadcrumbNew';
import Loading from '../components/common/Loading';

const TeamDetail = () => {
  const { teamId: rawTeamId, slug } = useParams<{ teamId?: string; slug?: string }>();
  const navigate = useNavigate();
  const { teams } = useTeams();
  const { bugs } = useBugs();
  const [team, setTeam] = useState<Team | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [managerName, setManagerName] = useState<string>('');
  const [teamLeadNames, setTeamLeadNames] = useState<string[]>([]);
  const [memberDetails, setMemberDetails] = useState<Record<string, { name: string; role: string }>>({});
  const [totalBugs, setTotalBugs] = useState<number>(0);
  const [bugsResolved, setBugsResolved] = useState<number>(0);

  // Decode the teamId if it was URL encoded
  const teamId = rawTeamId ? decodeURIComponent(rawTeamId) : undefined;

  const fetchTeamData = useCallback(async () => {
    if (!teamId && !slug) return;
    
    setLoading(true);
    try {
      let foundTeam: Team | null = null;
      
      if (teamId) {
        // Try to find by ID first
        const teamFromContext = teams.find(t => t.id === teamId);
        if (teamFromContext) {
          foundTeam = teamFromContext;
          // Set team immediately if found in context to avoid loading delay
          setTeam(foundTeam);
        } else {
          // If not found in context, try to fetch from service
          foundTeam = await getTeamById(teamId);
          setTeam(foundTeam);
        }
      } else if (slug) {
        // Try to find by slug
        const teamFromContext = teams.find(t => t.slug === slug);
        if (teamFromContext) {
          foundTeam = teamFromContext;
          // Set team immediately if found in context to avoid loading delay
          setTeam(foundTeam);
        } else {
          // If not found in context, try to fetch from service
          foundTeam = await getTeamBySlug(slug);
          setTeam(foundTeam);
        }
      }
      
      if (!foundTeam) {
        // Team not found, navigate back or show error
        navigate('/teams');
        setLoading(false);
        return;
      }
      
      // Generate and save slug if missing (do this asynchronously after UI is shown)
      if (!foundTeam.slug && foundTeam.name) {
        // Don't wait for slug generation - let it happen in background
        (async () => {
          try {
            const { slugify, generateUniqueSlug } = await import('../utils/slugify');
            const { updateTeam } = await import('../services/teamService');
            
            const baseSlug = slugify(foundTeam.name);
            // Use teams from context for existing slugs if available
            const existingSlugs = teams.map(t => t.slug || '').filter(Boolean);
            const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);
            
            await updateTeam(foundTeam.id, { slug: uniqueSlug });
            
            // Update local state and URL
            const updatedTeam = { ...foundTeam, slug: uniqueSlug };
            setTeam(updatedTeam);
            navigate(`/t/${uniqueSlug}`, { replace: true });
          } catch (error) {
            console.error('Error generating slug:', error);
            // Don't fail if slug generation fails - team can still be viewed by ID
          }
        })();
      }

      // Fetch team projects (in parallel with user data)
      const teamProjectsPromise = projectService.getProjectsByTeam(foundTeam.id);

      // Batch fetch all user names (manager + team leads) in parallel
      const userIds: string[] = [];
      if (foundTeam.managerId) {
        userIds.push(foundTeam.managerId);
      }
      if (foundTeam.teamLeadIds && foundTeam.teamLeadIds.length > 0) {
        userIds.push(...foundTeam.teamLeadIds);
      }

      const [teamProjects, userNamesMap] = await Promise.all([
        teamProjectsPromise,
        userIds.length > 0 ? getUserNamesByIds(userIds) : Promise.resolve<Record<string, string>>({})
      ]);

      setProjects(teamProjects);

      // Set manager name
      if (foundTeam.managerId && userNamesMap[foundTeam.managerId]) {
        setManagerName(userNamesMap[foundTeam.managerId]);
      }

      // Set team lead names
      if (foundTeam.teamLeadIds && foundTeam.teamLeadIds.length > 0) {
        const leadNames = foundTeam.teamLeadIds
          .map(id => userNamesMap[id])
          .filter(Boolean);
        setTeamLeadNames(leadNames);
      }

      // Fetch member details
      if (foundTeam.members && foundTeam.members.length > 0) {
        const details = await getUserDetailsByIds(foundTeam.members);
        setMemberDetails(details);
      }

      // Calculate bugs for projects in this team
      const projectIds = teamProjects.map(p => p.id);
      const teamBugs = bugs.filter(b => b.projectId && projectIds.includes(b.projectId));
      setTotalBugs(teamBugs.length);
      setBugsResolved(teamBugs.filter(b => b.status === 'completed').length);
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId, slug, teams, bugs, navigate]);

  useEffect(() => {
    if (teamId || slug) {
      fetchTeamData();
    }
  }, [teamId, slug, fetchTeamData]);

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'complete': return 'bg-blue-100 text-blue-800';
      case 'on_hold': return 'bg-yellow-100 text-yellow-800';
      case 'discontinued': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading team details..." />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Team not found</h2>
            <button
              onClick={() => navigate('/teams')}
              className="text-primary hover:text-primary/80"
            >
              Back to Teams
            </button>
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
            { label: 'Teams', href: '/teams' },
            { label: team.name }
          ]}
          showBackButton={true}
        />

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{team.name}</h1>
                <p className="text-gray-600 mt-1">{team.description || 'No description available'}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/teams')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to Teams"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Team Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Team Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{projects.length}</div>
                  <div className="text-sm text-gray-600">Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{totalBugs}</div>
                  <div className="text-sm text-gray-600">Total Bugs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{bugsResolved}</div>
                  <div className="text-sm text-gray-600">Resolved</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {(() => {
                      const members = Array.isArray(team.members) ? team.members : [];
                      
                      if (members.length === 0) {
                        return 0;
                      }
                      
                      if (Object.keys(memberDetails).length > 0) {
                        const teamMembers = members.filter(memberId => 
                          memberDetails[memberId]?.role === 'team_member'
                        );
                        return teamMembers.length;
                      }
                      
                      return members.length;
                    })()}
                  </div>
                  <div className="text-sm text-gray-600">Members</div>
                </div>
              </div>
            </div>

            {/* Team Leadership */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Leadership</h3>
              <div className="space-y-3">
                {managerName && (
                  <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                    <User className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{managerName}</div>
                      <div className="text-xs text-gray-600">Manager</div>
                    </div>
                  </div>
                )}
                {teamLeadNames && teamLeadNames.length > 0 && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <UserCheck className="w-5 h-5 text-green-600" />
                      <div className="text-xs text-gray-600">
                        {teamLeadNames.length === 1 ? 'Team Lead' : 'Team Leads'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {teamLeadNames.map((name, index) => (
                        <span 
                          key={index} 
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Team Members */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>
              <div className="space-y-2">
                {(() => {
                  const members = Array.isArray(team.members) ? team.members : [];
                  
                  if (members.length === 0) {
                    return <p className="text-sm text-gray-500">No members assigned</p>;
                  }
                  
                  // Show only team_member role users in the member list
                  const teamMembers = members.filter(memberId => 
                    memberDetails[memberId]?.role === 'team_member'
                  );

                  if (teamMembers.length === 0) {
                    return <p className="text-sm text-gray-500">No team members assigned</p>;
                  }

                  return (
                    <div className="space-y-2">
                      {teamMembers.map((memberId) => (
                        <div key={memberId} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg">
                          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                            <Users className="w-4 h-4 text-gray-600" />
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {memberDetails[memberId]?.name || memberId}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Team Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Information</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Created</span>
                  <span className="text-sm font-medium text-gray-900">
                    {team.createdAt instanceof Date 
                      ? team.createdAt.toLocaleDateString() 
                      : new Date(team.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="text-sm font-medium text-gray-900">
                    {team.updatedAt instanceof Date 
                      ? team.updatedAt.toLocaleDateString() 
                      : new Date(team.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Projects List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">Team Projects</h3>
                <div className="flex items-center space-x-2">
                  <Folder className="w-5 h-5 text-gray-500" />
                  <span className="text-sm text-gray-600">{projects.length} projects</span>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-12">
                  <Folder className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h4>
                  <p className="text-gray-600">This team hasn't been assigned any projects.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map((project) => {
                    const projectBugs = bugs.filter(b => b.projectId === project.id);
                    const projectResolved = projectBugs.filter(b => b.status === 'completed').length;
                    const projectProgress = projectBugs.length > 0 
                      ? Math.round((projectResolved / projectBugs.length) * 100) 
                      : 0;

                    return (
                      <div 
                        key={project.id} 
                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/preview`)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h4 className="text-lg font-semibold text-gray-900">{project.name}</h4>
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getProjectStatusColor(project.status)}`}>
                                {project.status}
                              </span>
                            </div>
                            <p className="text-gray-600 mb-3 line-clamp-2">
                              {project.shortDescription || project.description?.substring(0, 100) || 'No description available'}
                            </p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <div>
                                  <div className="text-xs text-gray-500">Start Date</div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {project.startDate 
                                      ? (project.startDate instanceof Date 
                                          ? project.startDate.toLocaleDateString() 
                                          : new Date(project.startDate).toLocaleDateString())
                                      : 'Not set'}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <div>
                                  <div className="text-xs text-gray-500">End Date</div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {project.expectedEndDate 
                                      ? (project.expectedEndDate instanceof Date 
                                          ? project.expectedEndDate.toLocaleDateString() 
                                          : new Date(project.expectedEndDate).toLocaleDateString())
                                      : 'Not set'}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <Bug className="w-4 h-4 text-red-500" />
                                <div>
                                  <div className="text-xs text-gray-500">Bugs</div>
                                  <div className="text-sm font-medium text-gray-900">{projectBugs.length}</div>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <div>
                                  <div className="text-xs text-gray-500">Resolved</div>
                                  <div className="text-sm font-medium text-gray-900">{projectResolved}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Progress</div>
                              <div className="text-sm font-medium text-gray-900">{projectProgress}%</div>
                            </div>
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                                style={{ width: `${projectProgress}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamDetail;

