"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type School = {
  id: number;
  name: string;
  type: "Public" | "Private" | "International";
  city: string;
  country: string;
  students: number;
  teachers: number;
  status: "Active" | "Inactive";
};

type View = "dashboard" | "schools";
type ModalStep = 1 | 2 | 3;

// ─── Initial Data ─────────────────────────────────────────────────────────────

const initialSchools: School[] = [
  { id: 1, name: "Greenfield Public School", type: "Public", city: "Mumbai", country: "India", students: 1240, teachers: 68, status: "Active" },
  { id: 2, name: "Sunrise Academy", type: "Private", city: "Pune", country: "India", students: 890, teachers: 45, status: "Active" },
  { id: 3, name: "Horizon International School", type: "International", city: "Bangalore", country: "India", students: 2100, teachers: 112, status: "Active" },
  { id: 4, name: "Maple Leaf School", type: "Private", city: "Delhi", country: "India", students: 650, teachers: 38, status: "Inactive" },
];

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────

const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Schools: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Analytics: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
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
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Help: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Logout: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Building: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
  GraduationCap: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  Teacher: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 11l-4 4-2-2" />
    </svg>
  ),
  Heart: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Gear: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Pin: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

// ─── Nav Items ────────────────────────────────────────────────────────────────

const navItems = [
  { id: "dashboard" as View, label: "Dashboard", icon: Icons.Dashboard },
  { id: "schools" as View, label: "Schools", icon: Icons.Schools },
] as const;

const staticNavItems = [
  { label: "Users", icon: Icons.Users },
  { label: "Analytics", icon: Icons.Analytics },
  { label: "Settings", icon: Icons.Settings },
];

// ─── Growth Chart SVG ─────────────────────────────────────────────────────────

function GrowthChart() {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN"];
  const pts = [
    [40, 160], [128, 148], [216, 108], [304, 100], [392, 108], [480, 28],
  ];

  const linePath = `M ${pts[0][0]},${pts[0][1]}
    C ${pts[0][0] + 40},${pts[0][1]} ${pts[1][0] - 40},${pts[1][1]} ${pts[1][0]},${pts[1][1]}
    C ${pts[1][0] + 40},${pts[1][1]} ${pts[2][0] - 40},${pts[2][1]} ${pts[2][0]},${pts[2][1]}
    C ${pts[2][0] + 40},${pts[2][1]} ${pts[3][0] - 40},${pts[3][1]} ${pts[3][0]},${pts[3][1]}
    C ${pts[3][0] + 40},${pts[3][1]} ${pts[4][0] - 40},${pts[4][1]} ${pts[4][0]},${pts[4][1]}
    C ${pts[4][0] + 40},${pts[4][1]} ${pts[5][0] - 40},${pts[5][1]} ${pts[5][0]},${pts[5][1]}`;

  const areaPath = `${linePath} L ${pts[5][0]},190 L ${pts[0][0]},190 Z`;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="font-semibold text-gray-800 text-base">Platform Growth Trends</h3>
          <p className="text-gray-400 text-xs mt-0.5">Overview of system adoption over the last 6 months</p>
        </div>
        <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
          Last 6 Months
        </span>
      </div>

      <svg viewBox="0 0 520 200" className="w-full" style={{ height: 200 }}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="40" y1={y} x2="490" y2={y} stroke="#f3f4f6" strokeWidth="1" />
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#chartFill)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="5" fill="white" stroke="#22c55e" strokeWidth="2.5" />
            {(i === 2 || i === 5) && (
              <circle cx={x} cy={y} r="3" fill="#22c55e" />
            )}
          </g>
        ))}
        {/* X-axis labels */}
        {months.map((m, i) => (
          <text
            key={m}
            x={pts[i][0]}
            y="196"
            textAnchor="middle"
            fontSize="10"
            fill="#9ca3af"
            fontFamily="sans-serif"
          >
            {m}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Schools at a Glance ──────────────────────────────────────────────────────

function SchoolsGlance({
  schools,
  onViewAll,
}: {
  schools: School[];
  onViewAll: () => void;
}) {
  const initials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 text-base">Schools at a Glance</h3>
        <button
          onClick={onViewAll}
          className="text-green-600 text-sm font-medium hover:text-green-700"
        >
          View All
        </button>
      </div>

      <div className="space-y-3 flex-1">
        {schools.slice(0, 4).map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
              {initials(s.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 text-sm truncate">{s.name}</div>
              <div className="text-gray-400 text-xs">{s.students.toLocaleString()} Students</div>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                s.status === "Active"
                  ? "bg-green-100 text-green-700"
                  : "bg-orange-100 text-orange-600"
              }`}
            >
              {s.status === "Active" ? "HEALTHY" : "REVIEW"}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 mt-4 pt-4">
        <div className="text-xs text-gray-400 mb-3">Total active subscriptions</div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {["bg-blue-400", "bg-green-400", "bg-purple-400"].map((c, i) => (
              <div key={i} className={`w-7 h-7 rounded-full ${c} border-2 border-white`} />
            ))}
          </div>
          <span className="text-xs text-gray-500 font-medium">+1.2k</span>
        </div>
        <button
          onClick={onViewAll}
          className="mt-3 w-full border border-gray-200 text-gray-700 text-sm py-2 rounded-xl hover:bg-gray-50 transition-colors font-medium"
        >
          View School Logs
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlatformAdminDashboard() {
  const [view, setView] = useState<View>("dashboard");
  const [schools, setSchools] = useState<School[]>(initialSchools);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [form, setForm] = useState({
    schoolName: "", schoolType: "" as "" | "Public" | "Private" | "International",
    city: "", country: "",
    adminName: "", adminEmail: "", adminPhone: "",
  });
  const [formError, setFormError] = useState("");

  // Search
  const [search, setSearch] = useState("");

  // ── Computed ──
  const totalStudents = schools.reduce((a, s) => a + s.students, 0);
  const totalTeachers = schools.reduce((a, s) => a + s.teachers, 0);

  const filteredSchools = schools.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.city.toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: "Total Schools", value: schools.length.toLocaleString(), trend: "+12%", icon: Icons.Building, bg: "bg-green-50", color: "text-green-600" },
    { label: "Total Students", value: totalStudents >= 1000 ? `${(totalStudents / 1000).toFixed(0)}k` : totalStudents.toLocaleString(), trend: "+5.4%", icon: Icons.GraduationCap, bg: "bg-blue-50", color: "text-blue-600" },
    { label: "Total Teachers", value: totalTeachers >= 1000 ? `${(totalTeachers / 1000).toFixed(0)}k` : totalTeachers.toLocaleString(), trend: "+3.1%", icon: Icons.Teacher, bg: "bg-purple-50", color: "text-purple-600" },
    { label: "Platform Health", value: "98.4%", trend: "+0.2%", icon: Icons.Heart, bg: "bg-emerald-50", color: "text-emerald-600" },
  ];

  // ── Modal Helpers ──
  function resetModal() {
    setShowModal(false);
    setModalStep(1);
    setForm({ schoolName: "", schoolType: "", city: "", country: "", adminName: "", adminEmail: "", adminPhone: "" });
    setFormError("");
  }

  function nextStep() {
    setFormError("");
    if (modalStep === 1) {
      if (!form.schoolName.trim() || !form.schoolType || !form.city.trim() || !form.country.trim()) {
        setFormError("All fields are required to continue.");
        return;
      }
    }
    if (modalStep === 2) {
      if (!form.adminName.trim() || !form.adminEmail.trim()) {
        setFormError("Admin name and email are required.");
        return;
      }
      if (!form.adminEmail.includes("@")) {
        setFormError("Please enter a valid email address.");
        return;
      }
    }
    if (modalStep < 3) setModalStep((s) => (s + 1) as ModalStep);
  }

  function confirmAddSchool() {
    const newSchool: School = {
      id: Date.now(),
      name: form.schoolName.trim(),
      type: form.schoolType as School["type"],
      city: form.city.trim(),
      country: form.country.trim(),
      students: 0,
      teachers: 0,
      status: "Active",
    };
    setSchools((prev) => [...prev, newSchool]);
    resetModal();
    setView("schools");
  }

  function toggleStatus(id: number) {
    setSchools((prev) =>
      prev.map((s) => s.id === id ? { ...s, status: s.status === "Active" ? "Inactive" : "Active" } : s)
    );
  }

  function deleteSchool(id: number) {
    if (confirm("Are you sure you want to remove this school?")) {
      setSchools((prev) => prev.filter((s) => s.id !== id));
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50 placeholder:text-gray-400";

  // ─── Sidebar ──────────────────────────────────────────────────────────────

  const Sidebar = (
    <aside className="w-[260px] shrink-0 bg-white flex flex-col h-full border-r border-gray-100">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm leading-tight">VLearnUlearn</div>
            <div className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">Platform Admin</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                active
                  ? "bg-green-50 text-green-700"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <span className={active ? "text-green-600" : "text-gray-400"}>
                <Icon />
              </span>
              {label}
            </button>
          );
        })}

        {staticNavItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 cursor-not-allowed opacity-60 text-left"
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-300 to-pink-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">Alex Henderson</div>
          <div className="text-xs text-gray-400 truncate">System Overlord</div>
        </div>
        <button className="text-gray-400 hover:text-gray-600 shrink-0">
          <Icons.Logout />
        </button>
      </div>
    </aside>
  );

  // ─── Top Bar ──────────────────────────────────────────────────────────────

  const TopBar = (
    <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {view === "dashboard" ? "Admin Dashboard" : "Manage Schools"}
        </h1>
        <p className="text-gray-400 text-xs mt-0.5">
          {view === "dashboard"
            ? "Welcome back, here's what's happening across the platform today."
            : "View, manage and configure all registered schools."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Icons.Search />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search data, schools, or users..."
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-green-300 bg-gray-50"
          />
        </div>
        <button className="relative w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50">
          <Icons.Bell />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50">
          <Icons.Help />
        </button>
      </div>
    </div>
  );

  // ─── Dashboard View ───────────────────────────────────────────────────────

  const DashboardView = (
    <div className="p-8 space-y-6">
      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setShowModal(true); setFormError(""); }}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors shadow-sm"
        >
          <Icons.Plus />
          Add New School
        </button>
        <button className="flex items-center gap-2 border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2.5 rounded-full hover:bg-gray-50 transition-colors">
          <Icons.Gear />
          Global Settings
        </button>
        <button className="flex items-center gap-2 border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2.5 rounded-full hover:bg-gray-50 transition-colors">
          <Icons.Download />
          Export Reports
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon />
              </div>
              <span className="text-xs font-semibold text-pink-500 bg-pink-50 px-2 py-0.5 rounded-full">
                {s.trend}
              </span>
            </div>
            <div className="text-gray-400 text-xs mb-1">{s.label}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Chart + glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GrowthChart />
        </div>
        <SchoolsGlance schools={schools} onViewAll={() => setView("schools")} />
      </div>
    </div>
  );

  // ─── Schools View ─────────────────────────────────────────────────────────

  const SchoolsView = (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{filteredSchools.length} school{filteredSchools.length !== 1 ? "s" : ""} found</div>
        <button
          onClick={() => { setShowModal(true); setFormError(""); }}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors shadow-sm"
        >
          <Icons.Plus />
          Add New School
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredSchools.length === 0 ? (
          <div className="text-center text-gray-400 py-20 text-sm">
            {search ? `No schools match "${search}"` : "No schools yet. Add your first school."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["School Name", "Type", "Location", "Students", "Teachers", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredSchools.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-800 text-sm">{s.name}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">
                        {s.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{s.city}, {s.country}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{s.students.toLocaleString()}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{s.teachers}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        s.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => toggleStatus(s.id)}
                          className={`text-xs font-medium ${
                            s.status === "Active"
                              ? "text-amber-600 hover:text-amber-800"
                              : "text-green-600 hover:text-green-800"
                          }`}
                        >
                          {s.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => deleteSchool(s.id)}
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Add School Modal ─────────────────────────────────────────────────────

  const stepTitles = ["School Details", "Admin Details", "Review & Confirm"];
  const stepSubtitles = [
    "Enter the basic information to register the new institution on the platform.",
    "Set up the primary administrator account for this school.",
    "Review the details before creating the school.",
  ];

  const Modal = showModal && (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Modal header */}
        <div className="px-8 pt-7 pb-5">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={resetModal} className="text-gray-400 hover:text-gray-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-700">Create New School</span>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`rounded-full transition-all duration-300 ${
                  modalStep === s
                    ? "w-8 h-2.5 bg-green-600"
                    : modalStep > s
                    ? "w-2.5 h-2.5 bg-green-400"
                    : "w-2.5 h-2.5 bg-gray-200"
                }`}
              />
            ))}
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">{stepTitles[modalStep - 1]}</h2>
          <p className="text-gray-500 text-sm">{stepSubtitles[modalStep - 1]}</p>
        </div>

        {/* Modal body */}
        <div className="px-8 pb-4 space-y-4">
          {modalStep === 1 && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">School Name</label>
                <input
                  type="text"
                  value={form.schoolName}
                  onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                  placeholder="e.g. Green Valley Academy"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">School Type</label>
                <select
                  value={form.schoolType}
                  onChange={(e) => setForm((f) => ({ ...f, schoolType: e.target.value as School["type"] }))}
                  className={inputCls}
                >
                  <option value="">Select Institution Type</option>
                  <option value="Public">Public</option>
                  <option value="Private">Private</option>
                  <option value="International">International</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">City</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600">
                      <Icons.Pin />
                    </span>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      placeholder="City"
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Country</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    placeholder="Country"
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {modalStep === 2 && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Admin Full Name</label>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                  placeholder="e.g. Priya Sharma"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Admin Email</label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                  placeholder="admin@school.edu"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone (optional)</label>
                <input
                  type="tel"
                  value={form.adminPhone}
                  onChange={(e) => setForm((f) => ({ ...f, adminPhone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {modalStep === 3 && (
            <div className="bg-gray-50 rounded-2xl p-5 space-y-3 text-sm">
              {[
                ["School Name", form.schoolName],
                ["Type", form.schoolType],
                ["Location", `${form.city}, ${form.country}`],
                ["Admin", form.adminName],
                ["Email", form.adminEmail],
                ...(form.adminPhone ? [["Phone", form.adminPhone]] : []),
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400 font-medium">{label}</span>
                  <span className="text-gray-800 font-semibold text-right">{val}</span>
                </div>
              ))}
            </div>
          )}

          {formError && (
            <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-8 pb-8 pt-3">
          {modalStep < 3 ? (
            <button
              onClick={nextStep}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {modalStep === 1 ? "Next: Admin Details" : "Next: Review"}
              <Icons.ArrowRight />
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setModalStep(2)}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold py-3.5 rounded-2xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={confirmAddSchool}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-2xl transition-colors"
              >
                Create School
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Shell ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {Sidebar}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {TopBar}
        {view === "dashboard" ? DashboardView : SchoolsView}
      </main>
      {Modal}
    </div>
  );
}
