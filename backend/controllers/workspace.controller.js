const { pool } = require('../config/db');

// GET /api/projects/:projectId/workspace-tasks
async function listWorkspaceTasks(req, res, next) {
    try {
        const projectId = req.params.projectId;

        // Fetch jira link if any
        const { rows: jiraRows } = await pool.query(
            `SELECT * FROM jira_links WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [projectId]
        );

        let { rows: tasks } = await pool.query(
            `SELECT * FROM workspace_tasks WHERE project_id = $1 ORDER BY created_at ASC`,
            [projectId]
        );

        // Auto-seed starter tasks if project has none yet
        if (!tasks.length) {
            const { rows: students } = await pool.query(
                `SELECT name FROM project_students WHERE project_id = $1 ORDER BY slot ASC`,
                [projectId]
            );
            const s1 = students[0]?.name || 'Lead Student';
            const s2 = students[1]?.name || 'Co-developer';
            const s3 = students[2]?.name || 'System Integrator';
            const pCode = req.project?.project_code || 'PROJ';

            const initial = [
                {
                    title: 'System Architecture & Requirements Baseline',
                    description: 'Draft software architecture specification, state machine diagrams, and component BOM.',
                    status: 'COMPLETED',
                    priority: 'HIGH',
                    assignee: s1,
                    jiraKey: `${pCode}-101`,
                },
                {
                    title: 'Core Module Implementation & Hardware Interfacing',
                    description: 'Implement driver communication protocols, sensor loop acquisition, and error handling pipeline.',
                    status: 'IN_PROGRESS',
                    priority: 'HIGH',
                    assignee: s2,
                    jiraKey: `${pCode}-102`,
                },
                {
                    title: 'Integration Testing, Benchmarking & Acceptance Tests',
                    description: 'Run automated end-to-end regression tests, measure response latency, and compile test sign-off report.',
                    status: 'TODO',
                    priority: 'MEDIUM',
                    assignee: s3,
                    jiraKey: `${pCode}-103`,
                },
            ];

            for (const item of initial) {
                const { rows: newRows } = await pool.query(
                    `INSERT INTO workspace_tasks (project_id, title, description, status, priority, assignee_name, jira_issue_key)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                    [projectId, item.title, item.description, item.status, item.priority, item.assignee, item.jiraKey]
                );
                tasks.push(newRows[0]);
            }
        }

        res.json({
            tasks,
            jiraLink: jiraRows[0] || null,
            project: {
                id: req.project.id,
                projectCode: req.project.project_code,
                title: req.project.title,
                mentorName: req.project.mentor_name,
                themeName: req.project.theme_name,
                ragStatus: req.project.rag_status,
                completionPct: req.project.completion_pct,
            },
        });
    } catch (err) {
        next(err);
    }
}

function canManageWorkspaceTask(user, project) {
    if (!user || !project) return false;
    const roles = user.roles || [];
    const isGuide = roles.includes('FACULTY_MENTOR') && (
        (project.mentor_user_id && project.mentor_user_id === user.id) ||
        (user.fullName && project.mentor_name &&
         project.mentor_name.trim().toLowerCase() === user.fullName.trim().toLowerCase()) ||
        (user.fullName && project.faculty_mentor_name &&
         project.faculty_mentor_name.trim().toLowerCase() === user.fullName.trim().toLowerCase()) ||
        (user.projectIds || []).includes(project.id)
    );
    const isStudent = roles.includes('STUDENT') && (user.projectIds || []).includes(project.id);
    return isGuide || isStudent;
}

// POST /api/projects/:projectId/workspace-tasks
async function createWorkspaceTask(req, res, next) {
    try {
        if (!canManageWorkspaceTask(req.user, req.project)) {
            return res.status(403).json({ error: 'Only the assigned faculty guide and team students can create workspace tasks.' });
        }

        const projectId = req.params.projectId;
        const { title, description, status, priority, assigneeName, jiraIssueKey } = req.body || {};

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Task title is required.' });
        }

        const validStatus = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
        const taskStatus = validStatus.includes(status) ? status : 'TODO';

        const validPriority = ['LOW', 'MEDIUM', 'HIGH'];
        const taskPriority = validPriority.includes(priority) ? priority : 'MEDIUM';

        const pCode = req.project?.project_code || 'PROJ';
        const key = jiraIssueKey ? jiraIssueKey.trim() : `${pCode}-${Math.floor(100 + Math.random() * 900)}`;

        const { rows } = await pool.query(
            `INSERT INTO workspace_tasks (project_id, title, description, status, priority, assignee_name, jira_issue_key, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [projectId, title.trim(), (description || '').trim(), taskStatus, taskPriority, (assigneeName || '').trim() || null, key, req.user?.id || null]
        );

        res.status(201).json({ task: rows[0] });
    } catch (err) {
        next(err);
    }
}

// PUT /api/projects/:projectId/workspace-tasks/:taskId
async function updateWorkspaceTask(req, res, next) {
    try {
        if (!canManageWorkspaceTask(req.user, req.project)) {
            return res.status(403).json({ error: 'Only the assigned faculty guide and team students can update workspace tasks.' });
        }

        const { projectId, taskId } = req.params;
        const { title, description, status, priority, assigneeName } = req.body || {};

        const { rows: existing } = await pool.query(
            `SELECT * FROM workspace_tasks WHERE id = $1 AND project_id = $2`,
            [taskId, projectId]
        );
        if (!existing.length) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        const validStatus = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
        const taskStatus = status && validStatus.includes(status) ? status : existing[0].status;

        const validPriority = ['LOW', 'MEDIUM', 'HIGH'];
        const taskPriority = priority && validPriority.includes(priority) ? priority : existing[0].priority;

        const taskTitle = title !== undefined && title.trim() ? title.trim() : existing[0].title;
        const taskDesc = description !== undefined ? description : existing[0].description;
        const taskAssignee = assigneeName !== undefined ? assigneeName : existing[0].assignee_name;

        const { rows } = await pool.query(
            `UPDATE workspace_tasks
             SET title = $1, description = $2, status = $3, priority = $4, assignee_name = $5, updated_at = now()
             WHERE id = $6 AND project_id = $7
             RETURNING *`,
            [taskTitle, taskDesc, taskStatus, taskPriority, taskAssignee, taskId, projectId]
        );

        res.json({ task: rows[0] });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/projects/:projectId/workspace-tasks/:taskId
async function deleteWorkspaceTask(req, res, next) {
    try {
        if (!canManageWorkspaceTask(req.user, req.project)) {
            return res.status(403).json({ error: 'Only the assigned faculty guide and team students can delete workspace tasks.' });
        }

        const { projectId, taskId } = req.params;
        const { rowCount } = await pool.query(
            `DELETE FROM workspace_tasks WHERE id = $1 AND project_id = $2`,
            [taskId, projectId]
        );
        if (!rowCount) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listWorkspaceTasks,
    createWorkspaceTask,
    updateWorkspaceTask,
    deleteWorkspaceTask,
};