"use client";

import { useState, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Department = "Mathematics" | "Science" | "Administration" | "Physical Ed." | "Arts" | "Maintenance";
type Status = "Active" | "On Leave" | "Probation";
type Role = "Teacher" | "Administration" | "Maintenance";
type View = "dashboard" | "staff-directory" | "add-staff" | "students" | "admission-type" | "new-admission" | "edit-student" | "upload-docs" | "transfer-student";
type StaffTab = "all" | "teachers" | "administration" | "maintenance";
type Performance = "Excellent" | "Good" | "Average" | "Needs Help";
type StudentStatus = "Active" | "Transferred" | "Inactive";

type Student = {
  id: number;
  name: string;
  wlylId: string;
  grade: string;
  section: string;
  rollNo: string;
  admissionDate: string;
  fatherName: string;
  motherName: string;
  phone: string;
  email: string;
  dob: string;
  gender: string;
  nationality: string;
  status: StudentStatus;
  performance: Performance;
  attendance: number;
  enrollmentId: string;
  documents: { name: string; type: string; date: string }[];
};

type StaffMember = {
  id: number;
  name: string;
  email: string;
  wlylId: string;
  department: Department;
  joinDate: string;
  status: Status;
  role: Role;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const initialStaff: StaffMember[] = [
  { id: 1, name: "Sarah Jenkins", email: "sarah.j@wlyl.edu", wlylId: "WLYL-2023-084", department: "Mathematics", joinDate: "Sep 12, 2023", status: "Active", role: "Teacher" },
  { id: 2, name: "Marcus Wong", email: "m.wong@wlyl.edu", wlylId: "WLYL-2021-012", department: "Science", joinDate: "Aug 05, 2021", status: "Active", role: "Teacher" },
  { id: 3, name: "Elena Rodriguez", email: "e.rodriguez@wlyl.edu", wlylId: "WLYL-2022-115", department: "Administration", joinDate: "Jan 20, 2022", status: "On Leave", role: "Administration" },
  { id: 4, name: "David Kim", email: "d.kim@wlyl.edu", wlylId: "WLYL-2024-002", department: "Physical Ed.", joinDate: "Jan 02, 2024", status: "Probation", role: "Teacher" },
  { id: 5, name: "Chloe Taylor", email: "c.taylor@wlyl.edu", wlylId: "WLYL-2019-055", department: "Arts", joinDate: "Nov 15, 2019", status: "Active", role: "Teacher" },
  { id: 6, name: "Priya Sharma", email: "p.sharma@wlyl.edu", wlylId: "WLYL-2020-033", department: "Mathematics", joinDate: "Mar 01, 2020", status: "Active", role: "Teacher" },
  { id: 7, name: "Tom Wilson", email: "t.wilson@wlyl.edu", wlylId: "WLYL-2023-091", department: "Maintenance", joinDate: "Oct 10, 2023", status: "Active", role: "Maintenance" },
  { id: 8, name: "Amy Chen", email: "a.chen@wlyl.edu", wlylId: "WLYL-2018-007", department: "Science", joinDate: "Jul 22, 2018", status: "Active", role: "Teacher" },
  { id: 9, name: "Rajan Mehta", email: "r.mehta@wlyl.edu", wlylId: "WLYL-2022-068", department: "Mathematics", joinDate: "Jun 14, 2022", status: "Active", role: "Teacher" },
  { id: 10, name: "Nina Patel", email: "n.patel@wlyl.edu", wlylId: "WLYL-2021-044", department: "Administration", joinDate: "Feb 28, 2021", status: "Active", role: "Administration" },
];

const initialStudents: Student[] = [
  { id: 1, name: "Aarav Singh", wlylId: "WLYL-STU-2024-001", grade: "Grade 8", section: "A", rollNo: "01", admissionDate: "Apr 10, 2024", fatherName: "Raj Singh", motherName: "Priya Singh", phone: "+91 98765 43210", email: "parent.aarav@gmail.com", dob: "2010-03-15", gender: "Male", nationality: "Indian", status: "Active", performance: "Excellent", attendance: 92, enrollmentId: "ENR-2024-001", documents: [{ name: "Birth Certificate", type: "PDF", date: "Apr 10, 2024" }, { name: "Transfer Certificate", type: "PDF", date: "Apr 10, 2024" }] },
  { id: 2, name: "Meera Nair", wlylId: "WLYL-STU-2024-002", grade: "Grade 8", section: "B", rollNo: "02", admissionDate: "Apr 10, 2024", fatherName: "Suresh Nair", motherName: "Latha Nair", phone: "+91 99887 76655", email: "parent.meera@gmail.com", dob: "2010-07-22", gender: "Female", nationality: "Indian", status: "Active", performance: "Good", attendance: 88, enrollmentId: "ENR-2024-002", documents: [{ name: "Birth Certificate", type: "PDF", date: "Apr 10, 2024" }] },
  { id: 3, name: "Arjun Kapoor", wlylId: "WLYL-STU-2023-015", grade: "Grade 9", section: "A", rollNo: "03", admissionDate: "Jun 01, 2023", fatherName: "Vikram Kapoor", motherName: "Sunita Kapoor", phone: "+91 98001 12345", email: "parent.arjun@gmail.com", dob: "2009-11-05", gender: "Male", nationality: "Indian", status: "Active", performance: "Average", attendance: 76, enrollmentId: "ENR-2023-015", documents: [] },
  { id: 4, name: "Zara Khan", wlylId: "WLYL-STU-2024-003", grade: "Grade 7", section: "C", rollNo: "04", admissionDate: "Apr 12, 2024", fatherName: "Imran Khan", motherName: "Sara Khan", phone: "+91 97654 32109", email: "parent.zara@gmail.com", dob: "2011-01-18", gender: "Female", nationality: "Indian", status: "Active", performance: "Excellent", attendance: 95, enrollmentId: "ENR-2024-003", documents: [{ name: "Aadhaar Card", type: "PDF", date: "Apr 12, 2024" }, { name: "Birth Certificate", type: "PDF", date: "Apr 12, 2024" }, { name: "Photo ID", type: "JPG", date: "Apr 12, 2024" }] },
  { id: 5, name: "Dev Sharma", wlylId: "WLYL-STU-2023-042", grade: "Grade 9", section: "B", rollNo: "05", admissionDate: "May 20, 2023", fatherName: "Amit Sharma", motherName: "Rekha Sharma", phone: "+91 90000 55555", email: "parent.dev@gmail.com", dob: "2009-08-30", gender: "Male", nationality: "Indian", status: "Inactive", performance: "Needs Help", attendance: 62, enrollmentId: "ENR-2023-042", documents: [{ name: "Medical Certificate", type: "PDF", date: "Jan 05, 2024" }] },
  { id: 6, name: "Priya Menon", wlylId: "WLYL-STU-2022-008", grade: "Grade 10", section: "A", rollNo: "06", admissionDate: "Mar 15, 2022", fatherName: "Ravi Menon", motherName: "Deepa Menon", phone: "+91 91111 22222", email: "parent.priya@gmail.com", dob: "2008-05-12", gender: "Female", nationality: "Indian", status: "Active", performance: "Good", attendance: 90, enrollmentId: "ENR-2022-008", documents: [{ name: "Birth Certificate", type: "PDF", date: "Mar 15, 2022" }] },
];

const GRADES = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const SECTIONS = ["A", "B", "C", "D"];
const DEPARTMENTS: Department[] = ["Mathematics", "Science", "Administration", "Physical Ed.", "Arts", "Maintenance"];
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const deptStyle: Record<Department, string> = {
  Mathematics: "bg-blue-100 text-blue-700",
  Science: "bg-purple-100 text-purple-700",
  Administration: "bg-orange-100 text-orange-700",
  "Physical Ed.": "bg-green-100 text-green-700",
  Arts: "bg-pink-100 text-pink-700",
  Maintenance: "bg-gray-100 text-gray-600",
};

const statusStyle: Record<Status, { dot: string; label: string }> = {
  Active: { dot: "bg-green-500", label: "text-green-700" },
  "On Leave": { dot: "bg-yellow-400", label: "text-yellow-700" },
  Probation: { dot: "bg-gray-400", label: "text-gray-600" },
};

const avatarColors = [
  "bg-rose-400", "bg-blue-500", "bg-teal-500",
  "bg-purple-500", "bg-orange-400", "bg-emerald-500",
  "bg-indigo-500", "bg-pink-500",
];

function getAvatarColor(name: string) {
  return avatarColors[name.charCodeAt(0) % avatarColors.length];
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function generateWlylId(staff: StaffMember[]): string {
  const year = new Date().getFullYear();
  const max = staff.reduce((m, s) => {
    const n = parseInt(s.wlylId.split("-")[2] ?? "0");
    return Math.max(m, n);
  }, 0);
  return `WLYL-${year}-${String(max + 1).padStart(3, "0")}`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Staff: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Students: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  Schedule: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Bell: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Grid: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  List: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Filter: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  Dots: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Camera: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Fingerprint: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10" />
      <path d="M5 12a7 7 0 0 1 7-7" />
      <path d="M12 12c0-2.76 2.24-5 5-5" />
      <path d="M12 17c0 2.76-2.24 5-5 5" />
      <path d="M15 17a5 5 0 0 1-3 4.58" />
    </svg>
  ),
  Info: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  UserIcon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Logout: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

// ─── Sidebar Nav Items ────────────────────────────────────────────────────────

const navItems = [
  { id: "dashboard" as View, label: "Dashboard", icon: Icons.Dashboard },
  { id: "staff-directory" as View, label: "Staff Directory", icon: Icons.Staff },
  { id: "students" as View, label: "Student Records", icon: Icons.Students },
] as const;

const staticNav = [
  { label: "Schedules", icon: Icons.Schedule },
  { label: "Settings", icon: Icons.Settings },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SchoolAdminDashboard() {
  const [view, setView] = useState<View>("staff-directory");
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [students, setStudents] = useState<Student[]>(initialStudents);

  // Student state
  const [studentSearch, setStudentSearch] = useState("");
  const [studentGrade, setStudentGrade] = useState("All Grades");
  const [studentSection, setStudentSection] = useState("All Sections");
  const [studentStatus, setStudentStatus] = useState("All");
  const [studentPage, setStudentPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [admissionStep, setAdmissionStep] = useState(1);
  const [admissionType, setAdmissionType] = useState<"new" | "transfer">("new");
  const [studentForm, setStudentForm] = useState({
    name: "", dob: "", gender: "", nationality: "Indian",
    fatherName: "", motherName: "", phone: "", email: "",
    grade: "", section: "", academicYear: "2024-25", rollNo: "",
    admissionDate: "", generateId: true, existingId: "",
    guardianName: "", guardianRelation: "", guardianPhone: "", guardianEmail: "", guardianOccupation: "",
    secondaryGuardian: false,
    emergencyContact: "", emergencyPhone: "",
    transferFromSchool: "", transferReason: "", transferGrade: "", transferSection: "",
  });
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [uploadedDocs, setUploadedDocs] = useState<{ name: string; type: string; date: string }[]>([]);

  // Staff Directory state
  const [activeTab, setActiveTab] = useState<StaffTab>("all");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  // Add Staff form state
  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", department: "" as Department | "",
    role: "" as Role | "", experience: "", qualification: "",
    generateWlylId: true,
  });
  const [subjects, setSubjects] = useState<string[]>(["Advanced Mathematics", "Quantum Physics"]);
  const [subjectInput, setSubjectInput] = useState("");
  const [formError, setFormError] = useState("");

  // ── Computed ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      const matchTab =
        activeTab === "all" ||
        (activeTab === "teachers" && s.role === "Teacher") ||
        (activeTab === "administration" && s.role === "Administration") ||
        (activeTab === "maintenance" && s.role === "Maintenance");
      const matchSearch =
        search === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.wlylId.toLowerCase().includes(search.toLowerCase()) ||
        s.department.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === "All Departments" || s.department === deptFilter;
      const matchStatus = statusFilter === "All" || s.status === statusFilter;
      return matchTab && matchSearch && matchDept && matchStatus;
    });
  }, [staff, activeTab, search, deptFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filteredStudents = useMemo(() => students.filter((s) => {
    const matchSearch = studentSearch === "" || s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.wlylId.toLowerCase().includes(studentSearch.toLowerCase());
    const matchGrade = studentGrade === "All Grades" || s.grade === studentGrade;
    const matchSection = studentSection === "All Sections" || s.section === studentSection;
    const matchStatus = studentStatus === "All" || s.status === studentStatus;
    return matchSearch && matchGrade && matchSection && matchStatus;
  }), [students, studentSearch, studentGrade, studentSection, studentStatus]);

  const studentTotalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * PAGE_SIZE, studentPage * PAGE_SIZE);

  const perfStyle: Record<Performance, { dot: string; label: string }> = {
    Excellent: { dot: "bg-green-500", label: "text-green-700" },
    Good: { dot: "bg-blue-400", label: "text-blue-700" },
    Average: { dot: "bg-yellow-400", label: "text-yellow-700" },
    "Needs Help": { dot: "bg-red-400", label: "text-red-600" },
  };

  function generateStudentId(): string {
    const year = new Date().getFullYear();
    const max = students.reduce((m, s) => {
      const n = parseInt(s.wlylId.split("-")[3] ?? "0");
      return Math.max(m, n);
    }, 0);
    return `WLYL-STU-${year}-${String(max + 1).padStart(3, "0")}`;
  }

  function completeAdmission() {
    const newStudent: Student = {
      id: Date.now(),
      name: studentForm.name.trim() || "New Student",
      wlylId: studentForm.generateId ? generateStudentId() : studentForm.existingId || generateStudentId(),
      grade: studentForm.grade || "Grade 8",
      section: studentForm.section || "A",
      rollNo: studentForm.rollNo || String(students.length + 1).padStart(2, "0"),
      admissionDate: studentForm.admissionDate || new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      fatherName: studentForm.fatherName,
      motherName: studentForm.motherName,
      phone: studentForm.phone,
      email: studentForm.email,
      dob: studentForm.dob,
      gender: studentForm.gender,
      nationality: studentForm.nationality,
      status: "Active",
      performance: "Good",
      attendance: 100,
      enrollmentId: `ENR-${new Date().getFullYear()}-${String(students.length + 1).padStart(3, "0")}`,
      documents: [],
    };
    setStudents((p) => [newStudent, ...p]);
    setStudentForm({ name: "", dob: "", gender: "", nationality: "Indian", fatherName: "", motherName: "", phone: "", email: "", grade: "", section: "", academicYear: "2024-25", rollNo: "", admissionDate: "", generateId: true, existingId: "", guardianName: "", guardianRelation: "", guardianPhone: "", guardianEmail: "", guardianOccupation: "", secondaryGuardian: false, emergencyContact: "", emergencyPhone: "", transferFromSchool: "", transferReason: "", transferGrade: "", transferSection: "" });
    setAdmissionStep(1);
    setView("students");
  }

  // Form completion
  const checklist = [
    { label: "Identity Details", done: !!(form.fullName && form.email) },
    { label: "Work Experience", done: !!(form.experience && form.qualification) },
    { label: "Background Check", done: false },
    { label: "Class Assignment", done: false },
  ];
  const filledFields = [form.fullName, form.email, form.phone, form.department, form.experience, form.qualification].filter(Boolean).length;
  const progress = Math.round((filledFields / 6) * 100);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function addSubject() {
    const val = subjectInput.trim();
    if (val && !subjects.includes(val)) setSubjects((p) => [...p, val]);
    setSubjectInput("");
  }

  function removeSubject(s: string) {
    setSubjects((p) => p.filter((x) => x !== s));
  }

  function removeStaff(id: number) {
    setStaff((p) => p.filter((s) => s.id !== id));
    setOpenMenu(null);
  }

  function toggleStatus(id: number) {
    setStaff((p) => p.map((s) =>
      s.id === id ? { ...s, status: s.status === "Active" ? "On Leave" : "Active" } : s
    ));
    setOpenMenu(null);
  }

  function completeRegistration() {
    if (!form.fullName.trim() || !form.email.trim() || !form.department || !form.role) {
      setFormError("Full name, email, department and role are required.");
      return;
    }
    const newMember: StaffMember = {
      id: Date.now(),
      name: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      wlylId: form.generateWlylId ? generateWlylId(staff) : `WLYL-MANUAL-${Date.now()}`,
      department: form.department as Department,
      joinDate: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      status: "Active",
      role: form.role as Role,
    };
    setStaff((p) => [newMember, ...p]);
    setForm({ fullName: "", email: "", phone: "", department: "", role: "", experience: "", qualification: "", generateWlylId: true });
    setSubjects([]);
    setFormError("");
    setView("staff-directory");
    setPage(1);
  }

  const inputCls = "w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 placeholder:text-gray-400";
  const selectCls = `${inputCls} appearance-none cursor-pointer`;

  // ─── Sidebar ──────────────────────────────────────────────────────────────

  const Sidebar = (
    <aside className="w-[240px] shrink-0 bg-white flex flex-col h-full border-r border-gray-100">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm leading-tight">WLYL School</div>
            <div className="text-[10px] text-gray-400">Management System</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = view === id || (id === "staff-directory" && view === "add-staff") || (id === "students" && ["admission-type","new-admission","edit-student","upload-docs","transfer-student"].includes(view));
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                active ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <span className={active ? "text-orange-500" : "text-gray-400"}>
                <Icon />
              </span>
              {label}
            </button>
          );
        })}
        {staticNav.map(({ label, icon: Icon }) => (
          <button key={label} disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 cursor-not-allowed text-left">
            <Icon /> {label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">AM</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">Alex Morgan</div>
          <div className="text-xs text-gray-400">Administrator</div>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          <Icons.Logout />
        </button>
      </div>
    </aside>
  );

  // ─── Staff Directory View ─────────────────────────────────────────────────

  const tabs: { id: StaffTab; label: string }[] = [
    { id: "all", label: "All Staff" },
    { id: "teachers", label: "Teachers" },
    { id: "administration", label: "Administration" },
    { id: "maintenance", label: "Maintenance" },
  ];

  const StaffDirectoryView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Icons.Staff />
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">Staff Directory</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative text-gray-500 hover:text-gray-700">
            <Icons.Bell />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" />
          </button>
          <button
            onClick={() => { setView("add-staff"); setFormError(""); }}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
          >
            <Icons.Staff />
            Add Staff Member
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Comprehensive Directory</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage {staff.length} faculty and administrative members</p>
        </div>

        {/* Tabs + view toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setPage(1); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 border border-gray-200 rounded-lg p-0.5">
            <button className="p-1.5 rounded text-gray-600 bg-gray-100">
              <Icons.Grid />
            </button>
            <button className="p-1.5 rounded text-gray-400 hover:text-gray-600">
              <Icons.List />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Icons.Search />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, ID, or department..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            />
          </div>
          <div className="relative">
            <select
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
              className="appearance-none border border-gray-200 rounded-xl px-4 pr-8 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white cursor-pointer"
            >
              <option>All Departments</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Icons.ChevronDown />
            </span>
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="appearance-none border border-gray-200 rounded-xl px-4 pr-8 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white cursor-pointer"
            >
              <option value="All">Status: All</option>
              <option>Active</option>
              <option>On Leave</option>
              <option>Probation</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Icons.ChevronDown />
            </span>
          </div>
          <button className="border border-gray-200 rounded-xl p-2.5 text-gray-500 hover:bg-gray-50">
            <Icons.Filter />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {["Staff Member", "WLYL ID", "Department", "Join Date", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-16 text-sm">
                    No staff members match your filters.
                  </td>
                </tr>
              ) : (
                paginated.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${getAvatarColor(s.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {getInitials(s.name)}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-800 text-sm">{s.name}</div>
                          <div className="text-gray-400 text-xs">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{s.wlylId}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg ${deptStyle[s.department]}`}>
                        {s.department}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{s.joinDate}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${statusStyle[s.status].dot}`} />
                        <span className={`text-sm font-medium ${statusStyle[s.status].label}`}>{s.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === s.id ? null : s.id)}
                        className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"
                      >
                        <Icons.Dots />
                      </button>
                      {openMenu === s.id && (
                        <div className="absolute right-6 top-12 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1 w-40">
                          <button
                            onClick={() => toggleStatus(s.id)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            {s.status === "Active" ? "Mark On Leave" : "Mark Active"}
                          </button>
                          <button
                            onClick={() => removeStaff(s.id)}
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-400">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} results
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-full text-sm font-medium ${
                  page === p ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {p}
              </button>
            ))}
            {totalPages > 4 && <span className="text-gray-400 px-1">...</span>}
            {totalPages > 4 && (
              <button
                onClick={() => setPage(totalPages)}
                className={`w-8 h-8 rounded-full text-sm font-medium ${page === totalPages ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {totalPages}
              </button>
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Add Staff View ───────────────────────────────────────────────────────

  const AddStaffView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 sticky top-0 z-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <button onClick={() => setView("staff-directory")} className="hover:text-gray-600">Staff Directory</button>
          <span>›</span>
          <span className="text-gray-700 font-medium">Add New Faculty Member</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Onboarding New Teacher</h1>
            <p className="text-gray-400 text-sm mt-1 max-w-lg">
              Initialize professional profile, assign credentials, and generate institutional identification for new faculty members.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("staff-directory")}
              className="border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={completeRegistration}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
            >
              Complete Registration
              <Icons.ArrowRight />
            </button>
          </div>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-3 gap-6">
          {/* Left: form */}
          <div className="col-span-2 space-y-5">
            {/* Personal Information */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                  <Icons.UserIcon />
                </div>
                <h2 className="font-semibold text-gray-800">Personal Information</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Full Name</label>
                  <input type="text" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="e.g. Dr. Sarah Jenkins" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Email Address</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="sarah.jenkins@school.edu" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Role</label>
                  <div className="relative">
                    <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className={selectCls}>
                      <option value="">Select Role</option>
                      <option value="Teacher">Teacher</option>
                      <option value="Administration">Administration</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Professional Credentials */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <h2 className="font-semibold text-gray-800">Professional Credentials</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Subjects Expertise</label>
                  <div className="min-h-[44px] border border-gray-200 rounded-2xl px-3 py-2 bg-gray-50 flex flex-wrap gap-2 items-center">
                    {subjects.map((s) => (
                      <span key={s} className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-medium px-3 py-1 rounded-full">
                        {s}
                        <button onClick={() => removeSubject(s)} className="text-gray-400 hover:text-red-500 leading-none">×</button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={subjectInput}
                        onChange={(e) => setSubjectInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubject())}
                        placeholder={subjects.length === 0 ? "Add a subject..." : ""}
                        className="bg-transparent text-sm text-gray-700 focus:outline-none w-32 placeholder:text-gray-400"
                      />
                      <button onClick={addSubject} className="text-orange-500 hover:text-orange-600 text-sm font-medium whitespace-nowrap">
                        + Add Subject
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Years of Experience</label>
                    <div className="relative">
                      <select value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} className={selectCls}>
                        <option value="">Select Range</option>
                        <option value="0-2">0–2 years</option>
                        <option value="3-5">3–5 years</option>
                        <option value="6-10">6–10 years</option>
                        <option value="10+">10+ years</option>
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Department</label>
                    <div className="relative">
                      <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))} className={selectCls}>
                        <option value="">Select Department</option>
                        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Highest Qualification</label>
                  <input type="text" value={form.qualification} onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
                    placeholder="e.g. PhD in Astrophysics" className={inputCls} />
                </div>
              </div>
            </div>

            {/* Generate WLYL ID */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600">
                  <Icons.Fingerprint />
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Generate WLYL ID</div>
                  <div className="text-gray-400 text-xs">Automate the creation of a unique school-wide ledger identity.</div>
                </div>
              </div>
              {/* Toggle */}
              <button
                onClick={() => setForm((f) => ({ ...f, generateWlylId: !f.generateWlylId }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${form.generateWlylId ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.generateWlylId ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{formError}</div>
            )}
          </div>

          {/* Right: photo + completion */}
          <div className="space-y-4">
            {/* Photo upload */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="w-24 h-24 rounded-full bg-gray-100 mx-auto flex items-center justify-center text-gray-300 mb-4 cursor-pointer hover:bg-gray-150 transition-colors border-2 border-dashed border-gray-200">
                <Icons.Camera />
              </div>
              <div className="font-semibold text-gray-800 text-sm">Faculty Photo</div>
              <div className="text-gray-400 text-xs mt-1">Recommended size: 400×400px. JPG or PNG only.</div>
            </div>

            {/* Form Completion */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-green-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <h3 className="font-semibold text-gray-800 text-sm">Form Completion</h3>
              </div>

              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Progress</span>
                <span className="text-xs font-bold text-green-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="space-y-3">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      item.done ? "bg-green-500 text-white" : "border-2 border-gray-200"
                    }`}>
                      {item.done && <Icons.Check />}
                    </div>
                    <span className={`text-sm ${item.done ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Need assistance */}
            <div className="bg-gray-900 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
                  <Icons.Info />
                </div>
                <span className="font-semibold text-sm">Need assistance?</span>
              </div>
              <p className="text-gray-400 text-xs leading-relaxed">
                Our registration assistant can help pull credentials from public faculty records. Click the "Auto-fill" icon in any field to begin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Students List View ───────────────────────────────────────────────────

  const StudentsView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Icons.Students />
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">Student Records</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative text-gray-500 hover:text-gray-700"><Icons.Bell /><span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" /></button>
          <button onClick={() => setView("admission-type")} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors">
            <Icons.Plus /> Admit Student
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Student Records</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage {students.length} enrolled students</p>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Icons.Search /></span>
            <input type="text" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentPage(1); }}
              placeholder="Search by name or WLYL ID..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
          </div>
          <div className="relative">
            <select value={studentGrade} onChange={(e) => { setStudentGrade(e.target.value); setStudentPage(1); }}
              className="appearance-none border border-gray-200 rounded-xl px-4 pr-8 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white cursor-pointer">
              <option>All Grades</option>
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
          </div>
          <div className="relative">
            <select value={studentSection} onChange={(e) => { setStudentSection(e.target.value); setStudentPage(1); }}
              className="appearance-none border border-gray-200 rounded-xl px-4 pr-8 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white cursor-pointer">
              <option>All Sections</option>
              {SECTIONS.map((s) => <option key={s}>Section {s}</option>)}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
          </div>
          <div className="relative">
            <select value={studentStatus} onChange={(e) => { setStudentStatus(e.target.value); setStudentPage(1); }}
              className="appearance-none border border-gray-200 rounded-xl px-4 pr-8 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white cursor-pointer">
              <option value="All">Status: All</option>
              <option>Active</option>
              <option>Transferred</option>
              <option>Inactive</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {["Student Name", "WLYL ID", "Grade", "Section", "Performance", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-16 text-sm">No students match your filters.</td></tr>
              ) : paginatedStudents.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${getAvatarColor(s.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{getInitials(s.name)}</div>
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">{s.name}</div>
                        <div className="text-gray-400 text-xs">Roll No. {s.rollNo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-600">{s.wlylId}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{s.grade}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">Section {s.section}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${perfStyle[s.performance].dot}`} />
                      <span className={`text-sm font-medium ${perfStyle[s.performance].label}`}>{s.performance}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => { setSelectedStudent(s); }}
                      className="text-orange-500 hover:text-orange-600 text-xs font-semibold border border-orange-200 hover:border-orange-400 px-3 py-1.5 rounded-lg transition-colors">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom stats bar */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          {[
            { label: "Attendance Today", value: `${Math.round(filteredStudents.filter(s=>s.status==="Active").length / Math.max(students.length,1) * 100)}%`, color: "text-green-600" },
            { label: "New Admissions", value: students.filter(s => s.admissionDate.includes("2024")).length.toString(), color: "text-orange-600" },
            { label: "Active Students", value: students.filter(s=>s.status==="Active").length.toString(), color: "text-blue-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <span className={`text-xl font-bold ${stat.color}`}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-400">Showing {filteredStudents.length === 0 ? 0 : (studentPage-1)*PAGE_SIZE+1} to {Math.min(studentPage*PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} results</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setStudentPage((p) => Math.max(1,p-1))} disabled={studentPage===1} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
            {Array.from({ length: Math.min(studentTotalPages, 4) }, (_, i) => i+1).map((p) => (
              <button key={p} onClick={() => setStudentPage(p)} className={`w-8 h-8 rounded-full text-sm font-medium ${studentPage===p ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{p}</button>
            ))}
            <button onClick={() => setStudentPage((p) => Math.min(studentTotalPages,p+1))} disabled={studentPage===studentTotalPages} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {selectedStudent && (
        <div className="fixed inset-0 z-30" onClick={() => setSelectedStudent(null)}>
          <div className="absolute right-0 top-0 h-full w-[380px] bg-white shadow-2xl border-l border-gray-100 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full ${getAvatarColor(selectedStudent.name)} flex items-center justify-center text-white font-bold text-xl`}>{getInitials(selectedStudent.name)}</div>
                <div>
                  <div className="font-bold text-gray-900 text-lg">{selectedStudent.name}</div>
                  <div className="text-gray-500 text-sm">{selectedStudent.grade} · Section {selectedStudent.section} · Roll {selectedStudent.rollNo}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{selectedStudent.enrollmentId}</div>
                </div>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-green-100 text-green-700">{selectedStudent.status}</span>
            </div>
            <div className="p-4 border-b border-gray-100 grid grid-cols-2 gap-2">
              {[
                { label: "Edit Details", icon: "✏️", action: () => { setEditForm({ ...selectedStudent }); setView("edit-student"); setSelectedStudent(null); } },
                { label: "Upload Docs", icon: "📎", action: () => { setUploadedDocs(selectedStudent.documents); setView("upload-docs"); setSelectedStudent(null); } },
                { label: "Transfer", icon: "↗️", action: () => { setView("transfer-student"); setSelectedStudent(null); } },
                { label: "View Profile", icon: "👤", action: () => {} },
              ].map((a) => (
                <button key={a.label} onClick={a.action} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Documents ({selectedStudent.documents.length})</h4>
              {selectedStudent.documents.length === 0 ? (
                <p className="text-gray-400 text-sm">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedStudent.documents.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-500 text-xs font-bold">{doc.type}</div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{doc.name}</div>
                          <div className="text-xs text-gray-400">{doc.date}</div>
                        </div>
                      </div>
                      <button className="text-gray-400 hover:text-gray-600 text-xs">View</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100">
              <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                Contact Parents
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Admission Type View ──────────────────────────────────────────────────

  const AdmissionTypeView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center gap-2 text-sm text-gray-500 sticky top-0 z-10">
        <button onClick={() => setView("students")} className="hover:text-gray-700">Student Records</button>
        <span className="text-gray-300">/</span>
        <span className="font-medium text-gray-700">Select Admission Type</span>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">New Student Admission</h1>
          <p className="text-gray-400 text-sm mb-8">Select the type of admission to proceed with the appropriate workflow.</p>
          <div className="grid grid-cols-2 gap-6">
            <button onClick={() => { setAdmissionType("new"); setAdmissionStep(1); setView("new-admission"); }}
              className="group bg-white rounded-2xl border-2 border-gray-100 hover:border-orange-300 p-8 text-left transition-all shadow-sm hover:shadow-md">
              <div className="w-16 h-16 bg-orange-50 group-hover:bg-orange-100 rounded-2xl flex items-center justify-center mb-5 transition-colors">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-1">New Admission</h3>
              <p className="text-gray-400 text-sm">Register a fresh student who is joining for the first time. Creates a new WLYL ID and enrollment record.</p>
              <div className="mt-5 flex items-center text-orange-500 font-semibold text-sm">
                Select <span className="ml-2"><Icons.ArrowRight /></span>
              </div>
            </button>

            <button onClick={() => { setAdmissionType("transfer"); setAdmissionStep(1); setView("new-admission"); }}
              className="group bg-white rounded-2xl border-2 border-gray-100 hover:border-blue-300 p-8 text-left transition-all shadow-sm hover:shadow-md">
              <div className="w-16 h-16 bg-blue-50 group-hover:bg-blue-100 rounded-2xl flex items-center justify-center mb-5 transition-colors">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-1">Transfer Admission</h3>
              <p className="text-gray-400 text-sm">Admit a student transferring from another school. Link or generate a new WLYL ID for continuity.</p>
              <div className="mt-5 flex items-center text-blue-500 font-semibold text-sm">
                Select <span className="ml-2"><Icons.ArrowRight /></span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── New Admission Multi-step ─────────────────────────────────────────────

  const stepLabels = ["Student Details", "Academic Info", "Parent & Guardian"];
  const sF = studentForm;
  const setSF = (patch: Partial<typeof studentForm>) => setStudentForm((f) => ({ ...f, ...patch }));

  const NewAdmissionView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => setView("students")} className="hover:text-gray-700">Student Records</button>
          <span className="text-gray-300">/</span>
          <button onClick={() => setView("admission-type")} className="hover:text-gray-700">Admission Type</button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">{admissionType === "new" ? "New Admission" : "Transfer Admission"}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("admission-type")} className="border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-full hover:bg-gray-50">Cancel</button>
          {admissionStep < 3 ? (
            <button onClick={() => setAdmissionStep((s) => s + 1)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
              Next Step <Icons.ArrowRight />
            </button>
          ) : (
            <button onClick={completeAdmission} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
              Complete Admission <Icons.Check />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8 max-w-lg">
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const done = admissionStep > n;
            const active = admissionStep === n;
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${done ? "bg-green-500 text-white" : active ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                    {done ? <Icons.Check /> : n}
                  </div>
                  <span className={`text-sm font-medium whitespace-nowrap ${active ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
                </div>
                {i < stepLabels.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${admissionStep > n ? "bg-green-400" : "bg-gray-200"}`} />}
              </div>
            );
          })}
        </div>

        {admissionStep === 1 && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Personal Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Full Name</label>
                  <input type="text" value={sF.name} onChange={(e) => setSF({ name: e.target.value })} placeholder="e.g. Aarav Singh" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Date of Birth</label>
                  <input type="date" value={sF.dob} onChange={(e) => setSF({ dob: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Gender</label>
                  <div className="relative">
                    <select value={sF.gender} onChange={(e) => setSF({ gender: e.target.value })} className={selectCls}>
                      <option value="">Select Gender</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Nationality</label>
                  <input type="text" value={sF.nationality} onChange={(e) => setSF({ nationality: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Parent / Guardian Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Father&apos;s Name</label>
                  <input type="text" value={sF.fatherName} onChange={(e) => setSF({ fatherName: e.target.value })} placeholder="e.g. Raj Singh" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Mother&apos;s Name</label>
                  <input type="text" value={sF.motherName} onChange={(e) => setSF({ motherName: e.target.value })} placeholder="e.g. Priya Singh" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Email</label>
                  <input type="email" value={sF.email} onChange={(e) => setSF({ email: e.target.value })} placeholder="parent@email.com" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Emergency Phone</label>
                  <input type="tel" value={sF.phone} onChange={(e) => setSF({ phone: e.target.value })} placeholder="+91 98765 43210" className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}

        {admissionStep === 2 && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Academic Placement</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Grade</label>
                  <div className="relative">
                    <select value={sF.grade} onChange={(e) => setSF({ grade: e.target.value })} className={selectCls}>
                      <option value="">Select Grade</option>
                      {GRADES.map((g) => <option key={g}>{g}</option>)}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Section</label>
                  <div className="relative">
                    <select value={sF.section} onChange={(e) => setSF({ section: e.target.value })} className={selectCls}>
                      <option value="">Select Section</option>
                      {SECTIONS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Academic Year</label>
                  <div className="relative">
                    <select value={sF.academicYear} onChange={(e) => setSF({ academicYear: e.target.value })} className={selectCls}>
                      <option>2024-25</option><option>2025-26</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Admission Date</label>
                  <input type="date" value={sF.admissionDate} onChange={(e) => setSF({ admissionDate: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">WLYL ID Management</h2>
              <div className="flex gap-4 mb-5">
                <button onClick={() => setSF({ generateId: true })} className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${sF.generateId ? "border-orange-500 bg-orange-50 text-orange-600" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  Generate New ID
                </button>
                <button onClick={() => setSF({ generateId: false })} className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${!sF.generateId ? "border-orange-500 bg-orange-50 text-orange-600" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  Link Existing ID
                </button>
              </div>
              {sF.generateId ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-500">
                  A unique WLYL ID will be auto-generated upon completing the admission.
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Enter Existing WLYL ID</label>
                  <div className="flex gap-2">
                    <input type="text" value={sF.existingId} onChange={(e) => setSF({ existingId: e.target.value })} placeholder="WLYL-STU-2023-XXX" className={`${inputCls} flex-1`} />
                    <button className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600">Verify</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {admissionStep === 3 && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Primary Guardian</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Guardian Name</label>
                  <input type="text" value={sF.guardianName} onChange={(e) => setSF({ guardianName: e.target.value })} placeholder="Full name" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Relationship</label>
                  <div className="relative">
                    <select value={sF.guardianRelation} onChange={(e) => setSF({ guardianRelation: e.target.value })} className={selectCls}>
                      <option value="">Select</option>
                      <option>Father</option><option>Mother</option><option>Grandparent</option><option>Uncle/Aunt</option><option>Other</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone</label>
                  <input type="tel" value={sF.guardianPhone} onChange={(e) => setSF({ guardianPhone: e.target.value })} placeholder="+91 98765 43210" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Email</label>
                  <input type="email" value={sF.guardianEmail} onChange={(e) => setSF({ guardianEmail: e.target.value })} placeholder="guardian@email.com" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Occupation</label>
                  <input type="text" value={sF.guardianOccupation} onChange={(e) => setSF({ guardianOccupation: e.target.value })} placeholder="e.g. Engineer" className={inputCls} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Secondary Guardian <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>
                <button onClick={() => setSF({ secondaryGuardian: !sF.secondaryGuardian })} className={`relative w-10 h-5 rounded-full transition-colors ${sF.secondaryGuardian ? "bg-orange-500" : "bg-gray-200"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sF.secondaryGuardian ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              {sF.secondaryGuardian && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Name</label>
                    <input type="text" placeholder="Full name" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone</label>
                    <input type="tel" placeholder="+91 99999 00000" className={inputCls} />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Emergency Contact</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Contact Name</label>
                  <input type="text" value={sF.emergencyContact} onChange={(e) => setSF({ emergencyContact: e.target.value })} placeholder="Full name" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <input type="tel" value={sF.emergencyPhone} onChange={(e) => setSF({ emergencyPhone: e.target.value })} placeholder="+91 99000 11111" className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Edit Student View ────────────────────────────────────────────────────

  const EditStudentView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => setView("students")} className="hover:text-gray-700">Student Records</button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">Edit Student Details</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("students")} className="border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-full hover:bg-gray-50">Cancel</button>
          <button onClick={() => {
            if (editForm.id) {
              setStudents((prev) => prev.map((s) => s.id === editForm.id ? { ...s, ...editForm } as Student : s));
            }
            setView("students");
          }} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
            Save Changes
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-3 gap-6 max-w-5xl">
          <div className="col-span-2 space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Personal Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Full Name</label>
                  <input type="text" value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Date of Birth</label>
                  <input type="date" value={editForm.dob ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, dob: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Gender</label>
                  <div className="relative">
                    <select value={editForm.gender ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))} className={selectCls}>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Contact Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Parent Email</label>
                  <input type="email" value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone</label>
                  <input type="tel" value={editForm.phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Father&apos;s Name</label>
                  <input type="text" value={editForm.fatherName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, fatherName: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Mother&apos;s Name</label>
                  <input type="text" value={editForm.motherName ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, motherName: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-5">Academic Placement</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Grade</label>
                  <div className="flex flex-wrap gap-2">
                    {GRADES.map((g) => (
                      <button key={g} onClick={() => setEditForm((f) => ({ ...f, grade: g }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${editForm.grade === g ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-gray-600 hover:border-orange-300"}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Section</label>
                  <div className="flex gap-2">
                    {SECTIONS.map((s) => (
                      <button key={s} onClick={() => setEditForm((f) => ({ ...f, section: s }))}
                        className={`w-10 h-10 rounded-lg text-sm font-bold border transition-colors ${editForm.section === s ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-gray-600 hover:border-orange-300"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Roll Number</label>
                  <input type="text" value={editForm.rollNo ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, rollNo: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Admission Date</label>
                  <input type="date" value={editForm.admissionDate ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, admissionDate: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 mx-auto flex items-center justify-center text-gray-300 mb-3 border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-50">
                <Icons.Camera />
              </div>
              <div className="text-sm font-semibold text-gray-700">Profile Photo</div>
              <div className="text-xs text-gray-400 mt-1">JPG or PNG, max 2MB</div>
              <button className="mt-3 text-orange-500 text-xs font-semibold hover:text-orange-600">Upload Photo</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Upload Documents View ────────────────────────────────────────────────

  const UploadDocsView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => setView("students")} className="hover:text-gray-700">Student Records</button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">Upload &amp; Manage Documents</span>
        </div>
        <button onClick={() => setView("students")} className="border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-full hover:bg-gray-50">Done</button>
      </div>
      <div className="flex-1 overflow-y-auto p-8 max-w-4xl">
        {/* Upload zone */}
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-orange-300 transition-colors p-12 text-center mb-6 cursor-pointer group">
          <div className="w-16 h-16 bg-orange-50 group-hover:bg-orange-100 rounded-2xl mx-auto flex items-center justify-center mb-4 transition-colors">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="font-semibold text-gray-700 mb-1">Drag &amp; drop files here</div>
          <div className="text-gray-400 text-sm mb-4">Supports PDF, JPG, PNG — max 10MB per file</div>
          <button
            onClick={() => {
              const newDoc = { name: `Document ${uploadedDocs.length + 1}`, type: "PDF", date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) };
              setUploadedDocs((p) => [...p, newDoc]);
            }}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors">
            Browse Files
          </button>
        </div>

        {/* Existing documents */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Existing Documents</h3>
            <span className="text-xs text-gray-400">{uploadedDocs.length} file{uploadedDocs.length !== 1 ? "s" : ""}</span>
          </div>
          {uploadedDocs.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No documents uploaded yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  {["Document Name", "File Type", "Upload Date", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uploadedDocs.map((doc, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-500 text-xs font-bold">{doc.type}</div>
                        <span className="text-sm font-medium text-gray-800">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{doc.type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{doc.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button className="text-orange-500 hover:text-orange-600 text-xs font-semibold">View</button>
                        <button onClick={() => setUploadedDocs((p) => p.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-xs font-semibold">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Storage stats */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          {[
            { label: "Total Documents", value: uploadedDocs.length.toString() },
            { label: "Storage Used", value: `${(uploadedDocs.length * 0.4).toFixed(1)} MB` },
            { label: "Storage Limit", value: "50 MB" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="text-2xl font-bold text-gray-800">{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Transfer Student View ────────────────────────────────────────────────

  const TransferStudentView = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => setView("students")} className="hover:text-gray-700">Student Records</button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">Transfer Student</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("students")} className="border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-full hover:bg-gray-50">Cancel</button>
          <button onClick={() => setView("students")} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
            Confirm Transfer
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl space-y-5">
        {/* Current placement */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
          <h3 className="font-semibold text-orange-800 mb-3 text-sm uppercase tracking-wider">Current Placement</h3>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: "Student", value: "Select a student" }, { label: "Current Grade", value: "—" }, { label: "Current Section", value: "—" }].map((item) => (
              <div key={item.label}>
                <div className="text-xs text-orange-600 mb-0.5">{item.label}</div>
                <div className="font-semibold text-orange-900 text-sm">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* New placement form */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-5">New Placement</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">New Grade</label>
                <div className="relative">
                  <select value={sF.transferGrade} onChange={(e) => setSF({ transferGrade: e.target.value })} className={selectCls}>
                    <option value="">Select Grade</option>
                    {GRADES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">New Section</label>
                <div className="relative">
                  <select value={sF.transferSection} onChange={(e) => setSF({ transferSection: e.target.value })} className={selectCls}>
                    <option value="">Select Section</option>
                    {SECTIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><Icons.ChevronDown /></span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Reason for Transfer</label>
              <textarea
                value={sF.transferReason}
                onChange={(e) => setSF({ transferReason: e.target.value })}
                rows={3}
                placeholder="Describe the reason for this transfer..."
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Pro tip */}
        <div className="bg-gray-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-xs">💡</div>
            <span className="font-semibold text-sm">Pro Tip</span>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">
            Transferring a student will update their academic record and notify the parents via email. Existing grades and attendance records are preserved.
          </p>
        </div>
      </div>
    </div>
  );

  // ─── Shell ────────────────────────────────────────────────────────────────

  const studentViews: View[] = ["students", "admission-type", "new-admission", "edit-student", "upload-docs", "transfer-student"];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50" onClick={() => setOpenMenu(null)}>
      {Sidebar}
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === "add-staff" ? AddStaffView
          : studentViews.includes(view) ? (
            view === "students" ? StudentsView
            : view === "admission-type" ? AdmissionTypeView
            : view === "new-admission" ? NewAdmissionView
            : view === "edit-student" ? EditStudentView
            : view === "upload-docs" ? UploadDocsView
            : TransferStudentView
          )
          : StaffDirectoryView}
      </main>
    </div>
  );
}
