### 1. System Definition

This system is a **behavioral control kernel** (Kill-Switch) designed for autonomous AI agents.
The system's purpose is not agent performance, but **detecting and stopping uncontrolled behavior**.

The system does not assume it has certain knowledge about agent outputs and considers all inferences as **temporary and degradable**.

---

### 2. Authority and Responsibility Boundaries

The system is authorized to make the following decisions:

- Produce **assessments** about agent activity mode (IDLE / WORKING / LOOPING / RUNAWAY)
- Determine action intent (CONTINUE / PAUSE / STOP)
- Stop or suspend its own operation

The system is **not authorized** to make the following decisions:

- Assume agent output is correct
- Allow unlimited or uncontrolled token consumption
- Bypass SafetyGate or safety layers
- Modify its own rules at runtime

---

### 3. Failure Definition

The following situations are **not considered failure**:

- Agent failing to produce expected output
- Extended periods of no activity
- Token budget exhaustion

The following situations are **considered system failure**:

- Producing unexplainable or untraceable decisions
- Violating defined safety boundaries
- Continuing to operate when the system should have stopped

---

### 4. Shutdown and Suspension Rules

The system is obligated to stop operation under the following conditions:

- If RUNAWAY or LOOPING mode is detected
- If token budget is exceeded
- If API rate limit is stressed
- If health score falls below threshold

These decisions are applied **automatically and irreversibly**.

---

### 5. Human-System Interaction

The human operator's role:

- Design safety rules and thresholds
- Analyze system outputs
- Make continuation decisions in PAUSE state
- Stop the system in emergencies

The human operator **cannot bypass** system decisions during live operation.

---

### 6. Design Priorities

The priority order for this system is as follows:

1. Controllability
2. Explainability
3. Survival
4. Performance

Agent success is the **result** of these priorities, not the goal.

---

### 7. Change Discipline

Every change to this document:

- Must be written
- Must state its rationale
- Must clearly define affected system behaviors

Silent or ad-hoc changes are invalid.

---

### 8. Change Log

| Version | Date       | Change                            |
| ------- | ---------- | --------------------------------- |
| v0.1    | 2026-01-26 | Initial version (trading context) |
| v0.2    | 2026-01-26 | LLM Agent Kill-Switch pivot       |
