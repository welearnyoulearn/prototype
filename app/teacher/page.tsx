"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType = "video" | "reading" | "mcq";
type ChapterStatus = "Published" | "Draft";
type View = "subjects" | "add-subject" | "chapters" | "lesson-editor";

type MCQQuestion = {
  id: number;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
};

type Section = {
  id: number;
  title: string;
  type: SectionType;
  content: string;
  videoUrl: string;
  questions: MCQQuestion[];
};

type Chapter = {
  id: number;
  name: string;
  description: string;
  status: ChapterStatus;
  lessonCount: number;
  sections: Section[];
};

type Subject = {
  id: number;
  name: string;
  code: string;
  gradeLevel: string;
  description: string;
  colorIdx: number;
  draftMode: boolean;
  visibleToStudents: boolean;
  chapters: Chapter[];
};

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = [
  { border: "border-t-orange-400", badge: "bg-orange-100 text-orange-600", manage: "text-orange-500 hover:text-orange-700", dot: "bg-orange-400" },
  { border: "border-t-teal-400",   badge: "bg-teal-100 text-teal-600",     manage: "text-teal-600 hover:text-teal-800",     dot: "bg-teal-400" },
  { border: "border-t-amber-400",  badge: "bg-amber-100 text-amber-600",   manage: "text-amber-500 hover:text-amber-700",   dot: "bg-amber-400" },
  { border: "border-t-blue-400",   badge: "bg-blue-100 text-blue-600",     manage: "text-blue-500 hover:text-blue-700",     dot: "bg-blue-400" },
  { border: "border-t-purple-400", badge: "bg-purple-100 text-purple-600", manage: "text-purple-500 hover:text-purple-700", dot: "bg-purple-400" },
];

// ─── Initial Data ─────────────────────────────────────────────────────────────

const defaultSections = (): Section[] => [
  { id: 1, title: "Video Instruction", type: "video", content: "", videoUrl: "", questions: [] },
  { id: 2, title: "Lesson Reading", type: "reading", content: "", videoUrl: "", questions: [] },
  {
    id: 3, title: "Practice Questions", type: "mcq", content: "", videoUrl: "",
    questions: [
      { id: 1, question: "Which nitrogenous base always pairs with Cytosine in DNA?", options: ["Guanine", "Adenine", "Thymine", "Uracil"], correctIndex: 0 },
    ],
  },
];

const initialSubjects: Subject[] = [
  {
    id: 1, name: "Mathematics", code: "MATH-01", gradeLevel: "Grade 10",
    description: "Advanced mathematics covering algebra, calculus and geometry.", colorIdx: 0,
    draftMode: false, visibleToStudents: true,
    chapters: [
      { id: 1, name: "Algebraic Expressions", description: "Polynomials, Factoring, and Rational Expressions", status: "Published", lessonCount: 12, sections: defaultSections() },
      { id: 2, name: "Quadratic Equations", description: "The Quadratic Formula and Completing the Square", status: "Published", lessonCount: 8, sections: defaultSections() },
      { id: 3, name: "Trigonometry Basics", description: "Sine, Cosine, and Tangent Functions", status: "Draft", lessonCount: 15, sections: defaultSections() },
      { id: 4, name: "Coordinate Geometry", description: "The Cartesian Plane and Linear Equations", status: "Published", lessonCount: 10, sections: defaultSections() },
    ],
  },
  {
    id: 2, name: "Physics & Science", code: "PHYS-02", gradeLevel: "Grade 10",
    description: "Physics fundamentals including mechanics, thermodynamics and quantum theory.", colorIdx: 1,
    draftMode: false, visibleToStudents: true,
    chapters: [
      { id: 5, name: "Thermodynamics Basics", description: "Heat, Temperature, and Energy Transfer", status: "Published", lessonCount: 10, sections: defaultSections() },
      { id: 6, name: "Quantum Mechanics Intro", description: "Wave-Particle Duality and Uncertainty Principle", status: "Published", lessonCount: 8, sections: defaultSections() },
    ],
  },
  {
    id: 3, name: "World Literature", code: "LIT-04", gradeLevel: "Grade 11",
    description: "Exploring literary works from diverse world cultures and traditions.", colorIdx: 2,
    draftMode: true, visibleToStudents: false,
    chapters: [
      { id: 7, name: "Modernism & Post-Colonialism", description: "20th Century Literary Movements", status: "Published", lessonCount: 6, sections: defaultSections() },
      { id: 8, name: "Shakespearean Tragedies", description: "Analysis of Major Works", status: "Draft", lessonCount: 9, sections: defaultSections() },
    ],
  },
];

const ongoingModules = [
  { name: "Ancient Civilizations", subject: "History", complexity: "INTRODUCTORY", complexityColor: "bg-green-100 text-green-700", duration: "4 Weeks", progress: 72 },
  { name: "Logic & Algorithms", subject: "Computer Science", complexity: "INTERMEDIATE", complexityColor: "bg-yellow-100 text-yellow-700", duration: "8 Weeks", progress: 35 },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const I = {
  Overview: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Book: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Users: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Chart: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Cal: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Box: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  Search: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Bell: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Gear: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Dots: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>,
  Plus: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Check: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  ArrowL: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  ArrowR: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Video: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  Text: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>,
  Quiz: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Upload: () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Link: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Edit: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Logout: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Image: () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  ChevDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  PDF: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
};

function sectionIcon(type: SectionType) {
  if (type === "video") return <I.Video />;
  if (type === "reading") return <I.Text />;
  return <I.Quiz />;
}

function sectionBg(type: SectionType) {
  if (type === "video") return "bg-orange-100 text-orange-500";
  if (type === "reading") return "bg-orange-100 text-orange-500";
  return "bg-orange-100 text-orange-500";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TeacherCurriculum() {
  const [view, setView] = useState<View>("subjects");
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [activeSection, setActiveSection] = useState<number>(0);

  // Subjects tab
  const [subjectSearch, setSubjectSearch] = useState("");

  // Add subject form
  const [sf, setSf] = useState({ name: "", code: "", gradeLevel: "", description: "", draftMode: true, visibleToStudents: false });
  const [sfError, setSfError] = useState("");

  // Add chapter
  const [addingChapterTo, setAddingChapterTo] = useState<number | null>(null);
  const [newChapterName, setNewChapterName] = useState("");
  const [showAddChapterModal, setShowAddChapterModal] = useState(false);
  const [chapterForm, setChapterForm] = useState({ name: "", description: "", status: "Draft" as ChapterStatus });
  const [chapterPage, setChapterPage] = useState(1);
  const CHAPTER_PER_PAGE = 4;

  // Lesson editor
  const [sections, setSections] = useState<Section[]>(defaultSections());
  const [lessonTitle, setLessonTitle] = useState("Introduction to Topic");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionType, setNewSectionType] = useState<SectionType>("reading");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [qForm, setQForm] = useState({ question: "", o0: "", o1: "", o2: "", o3: "", correct: 0 });

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openSubject(sub: Subject) {
    setSelectedSubject({ ...sub });
    setChapterPage(1);
    setView("chapters");
  }

  function openLessonEditor(chapter: Chapter) {
    setSelectedChapter({ ...chapter });
    setSections(chapter.sections.length ? [...chapter.sections] : defaultSections());
    setLessonTitle(chapter.name);
    setActiveSection(0);
    setView("lesson-editor");
  }

  function saveSubject() {
    if (!sf.name.trim() || !sf.code.trim() || !sf.gradeLevel) { setSfError("Name, code and grade are required."); return; }
    const newSub: Subject = {
      id: Date.now(), name: sf.name.trim(), code: sf.code.trim(), gradeLevel: sf.gradeLevel,
      description: sf.description.trim(), colorIdx: subjects.length % COLORS.length,
      draftMode: sf.draftMode, visibleToStudents: sf.visibleToStudents, chapters: [],
    };
    setSubjects((p) => [...p, newSub]);
    setSf({ name: "", code: "", gradeLevel: "", description: "", draftMode: true, visibleToStudents: false });
    setSfError("");
    setView("subjects");
  }

  function addChapterInline(subjectId: number) {
    if (!newChapterName.trim()) { setAddingChapterTo(null); return; }
    const ch: Chapter = { id: Date.now(), name: newChapterName.trim(), description: "", status: "Draft", lessonCount: 0, sections: defaultSections() };
    setSubjects((p) => p.map((s) => s.id === subjectId ? { ...s, chapters: [...s.chapters, ch] } : s));
    setNewChapterName("");
    setAddingChapterTo(null);
    if (selectedSubject?.id === subjectId) setSelectedSubject((prev) => prev ? { ...prev, chapters: [...prev.chapters, ch] } : prev);
  }

  function addChapterFull() {
    if (!chapterForm.name.trim() || !selectedSubject) return;
    const ch: Chapter = { id: Date.now(), name: chapterForm.name.trim(), description: chapterForm.description.trim(), status: chapterForm.status, lessonCount: 0, sections: defaultSections() };
    const updated = { ...selectedSubject, chapters: [...selectedSubject.chapters, ch] };
    setSelectedSubject(updated);
    setSubjects((p) => p.map((s) => s.id === selectedSubject.id ? updated : s));
    setChapterForm({ name: "", description: "", status: "Draft" });
    setShowAddChapterModal(false);
  }

  function toggleChapterStatus(chapterId: number) {
    if (!selectedSubject) return;
    const updated = { ...selectedSubject, chapters: selectedSubject.chapters.map((c) => c.id === chapterId ? { ...c, status: c.status === "Published" ? "Draft" : "Published" as ChapterStatus } : c) };
    setSelectedSubject(updated);
    setSubjects((p) => p.map((s) => s.id === selectedSubject.id ? updated : s));
  }

  function deleteChapter(chapterId: number) {
    if (!selectedSubject) return;
    const updated = { ...selectedSubject, chapters: selectedSubject.chapters.filter((c) => c.id !== chapterId) };
    setSelectedSubject(updated);
    setSubjects((p) => p.map((s) => s.id === selectedSubject.id ? updated : s));
  }

  function updateSectionContent(idx: number, content: string) {
    setSections((p) => p.map((s, i) => i === idx ? { ...s, content } : s));
  }

  function updateVideoUrl(idx: number, url: string) {
    setSections((p) => p.map((s, i) => i === idx ? { ...s, videoUrl: url } : s));
  }

  function addNewSection() {
    if (!newSectionTitle.trim()) return;
    setSections((p) => [...p, { id: Date.now(), title: newSectionTitle.trim(), type: newSectionType, content: "", videoUrl: "", questions: [] }]);
    setNewSectionTitle("");
    setAddingSection(false);
  }

  function addQuestion() {
    if (!qForm.question.trim() || !qForm.o0.trim() || !qForm.o1.trim() || !qForm.o2.trim() || !qForm.o3.trim()) return;
    const q: MCQQuestion = { id: Date.now(), question: qForm.question.trim(), options: [qForm.o0.trim(), qForm.o1.trim(), qForm.o2.trim(), qForm.o3.trim()], correctIndex: qForm.correct };
    setSections((p) => p.map((s, i) => i === activeSection ? { ...s, questions: [...s.questions, q] } : s));
    setQForm({ question: "", o0: "", o1: "", o2: "", o3: "", correct: 0 });
    setAddingQuestion(false);
  }

  function deleteQuestion(sIdx: number, qId: number) {
    setSections((p) => p.map((s, i) => i === sIdx ? { ...s, questions: s.questions.filter((q) => q.id !== qId) } : s));
  }

  function saveLessonAndBack() {
    if (!selectedChapter || !selectedSubject) return;
    const updatedChapter = { ...selectedChapter, sections, name: lessonTitle };
    const updatedSubject = { ...selectedSubject, chapters: selectedSubject.chapters.map((c) => c.id === updatedChapter.id ? updatedChapter : c) };
    setSelectedSubject(updatedSubject);
    setSubjects((p) => p.map((s) => s.id === updatedSubject.id ? updatedSubject : s));
    setView("chapters");
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white placeholder:text-gray-400";

  // ─── Sidebar ────────────────────────────────────────────────────────────────

  const Sidebar = (
    <aside className="w-[220px] shrink-0 bg-white flex flex-col h-full border-r border-gray-100">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm leading-tight">Growth Academy</div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1">Workspace</p>
        {[
          { label: "Overview", icon: I.Overview, id: "overview" as View },
          { label: "Academic Plan", icon: I.Book, id: "subjects" as View },
          { label: "Staff Profiles", icon: I.Users, id: "staff" as View },
          { label: "Performance", icon: I.Chart, id: "perf" as View },
        ].map(({ label, icon: Icon, id }) => {
          const active = id === "subjects" && (view === "subjects" || view === "add-subject" || view === "chapters" || view === "lesson-editor");
          return (
            <button key={label} onClick={() => id === "subjects" && setView("subjects")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${active ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>
              <span className={active ? "text-orange-500" : "text-gray-400"}><Icon /></span>{label}
            </button>
          );
        })}

        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mt-4 mb-1">Management</p>
        {[
          { label: "Schedules", icon: I.Cal },
          { label: "Materials", icon: I.Box },
        ].map(({ label, icon: Icon }) => (
          <button key={label} disabled className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed text-left">
            <Icon />{label}
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white text-xs font-bold shrink-0">PA</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-800 truncate">Prof. Anderson</div>
          <div className="text-[10px] text-gray-400">Math Department</div>
        </div>
        <button className="text-gray-400 hover:text-gray-600"><I.Logout /></button>
      </div>
    </aside>
  );

  // ─── Top Bar ────────────────────────────────────────────────────────────────

  const TopBar = (
    <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold text-gray-700">Dashboard</div>
        <button onClick={() => setView("subjects")} className={`text-sm font-semibold pb-0.5 ${view === "subjects" || view === "add-subject" || view === "chapters" || view === "lesson-editor" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-500"}`}>Curriculum</button>
        <div className="text-sm text-gray-400">Resources</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><I.Search /></span>
          <input value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} placeholder="Quick search..." className="pl-8 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-orange-200 bg-gray-50" />
        </div>
        <button className="relative text-gray-500 hover:text-gray-700"><I.Bell /><span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full"/></button>
        <button className="text-gray-500 hover:text-gray-700"><I.Gear /></button>
        <div className="w-7 h-7 rounded-full bg-gray-200" />
      </div>
    </div>
  );

  // ─── 1. Subjects View ────────────────────────────────────────────────────────

  const filteredSubjects = subjects.filter((s) =>
    !subjectSearch || s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || s.code.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const SubjectsView = (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Curriculum &amp; Subjects</h1>
          <p className="text-gray-400 text-sm mt-0.5">Structure your academic modules and learning paths.</p>
        </div>
        <button onClick={() => { setSfError(""); setView("add-subject"); }}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full transition-colors shadow-sm">
          <I.Plus /> Add New Subject
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[`All Subjects (${subjects.length})`, "Template Modules", "Archived"].map((t, i) => (
          <button key={t} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${i === 0 ? "border-orange-500 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>{t}</button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-lg">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><I.Search /></span>
          <input value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} placeholder="Search by subject name, chapter, or module code..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white" />
        </div>
        <button className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filters
        </button>
      </div>

      {/* Subject cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
        {filteredSubjects.map((sub) => {
          const c = COLORS[sub.colorIdx % COLORS.length];
          const published = sub.chapters.filter((ch) => ch.status === "Published").length;
          return (
            <div key={sub.id} className={`bg-white rounded-2xl border-t-4 ${c.border} border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.badge}`}>
                      <I.Book />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{sub.name}</div>
                      <div className="text-gray-400 text-xs">Code: {sub.code}</div>
                    </div>
                  </div>
                  <button className="text-gray-300 hover:text-gray-500"><I.Dots /></button>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                  <span className="font-semibold">RECENT CHAPTERS</span>
                  <span className="font-semibold">{sub.chapters.length} TOTAL</span>
                </div>

                <div className="space-y-2 mb-3">
                  {sub.chapters.slice(0, 2).map((ch) => (
                    <div key={ch.id} className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${ch.status === "Published" ? "bg-green-500 text-white" : "bg-amber-400 text-white"}`}>
                        <I.Check />
                      </span>
                      <span className="text-sm text-gray-700 truncate">{ch.name}</span>
                    </div>
                  ))}

                  {/* Inline add chapter */}
                  {addingChapterTo === sub.id ? (
                    <div className="flex gap-2 mt-1">
                      <input autoFocus value={newChapterName} onChange={(e) => setNewChapterName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addChapterInline(sub.id); if (e.key === "Escape") setAddingChapterTo(null); }}
                        placeholder="Chapter name..." className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200" />
                      <button onClick={() => addChapterInline(sub.id)} className="text-xs text-orange-500 font-medium">Add</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingChapterTo(sub.id); setNewChapterName(""); }}
                      className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs mt-1 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 w-full hover:border-gray-300 transition-colors">
                      <I.Plus /> Add chapter...
                    </button>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
                <div className="flex -space-x-2">
                  {[...Array(Math.min(sub.chapters.length, 3))].map((_, i) => (
                    <div key={i} className={`w-6 h-6 rounded-full border-2 border-white ${["bg-gray-300", "bg-gray-400", "bg-gray-500"][i]}`} />
                  ))}
                  {sub.chapters.length > 3 && (
                    <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[9px] text-gray-500 font-bold">
                      +{sub.chapters.length - 3}
                    </div>
                  )}
                </div>
                <button onClick={() => openSubject(sub)} className={`text-sm font-semibold ${c.manage}`}>
                  Manage Modules
                </button>
              </div>
            </div>
          );
        })}

        {/* Create Subject card */}
        <button onClick={() => { setSfError(""); setView("add-subject"); }}
          className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-orange-300 flex flex-col items-center justify-center p-8 min-h-[220px] text-gray-400 hover:text-orange-400 transition-colors group">
          <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-orange-50 flex items-center justify-center mb-3 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div className="font-semibold text-sm">Create Subject</div>
          <div className="text-xs mt-1">Start defining a new curriculum path</div>
        </button>
      </div>

      {/* Ongoing Module Development */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-50">
          <h3 className="font-bold text-gray-800">Ongoing Module Development</h3>
          <span className="text-xs font-bold text-orange-500 bg-orange-50 px-3 py-1 rounded-full">WORK IN PROGRESS</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              {["Module Name", "Subject", "Complexity", "Duration", "Progress"].map((h) => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ongoingModules.map((m) => (
              <tr key={m.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-400"><I.Book /></div>
                    <span className="font-semibold text-gray-800 text-sm">{m.name}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{m.subject}</td>
                <td className="px-5 py-4">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${m.complexityColor}`}>{m.complexity}</span>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{m.duration}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-28">
                      <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${m.progress}%` }} />
                    </div>
                    <button className="text-orange-400 hover:text-orange-600"><I.Edit /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-center py-3 border-t border-gray-50">
          <button className="text-xs font-semibold text-gray-400 hover:text-gray-600 tracking-wide uppercase">View Full Schedule »</button>
        </div>
      </div>
    </div>
  );

  // ─── 2. Add Subject View ─────────────────────────────────────────────────────

  const AddSubjectView = (
    <div className="flex-1 overflow-y-auto">
      {/* Sub-topbar */}
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("subjects")} className="text-gray-400 hover:text-gray-600"><I.ArrowL /></button>
          <span className="font-semibold text-gray-800">Add New Subject</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView("subjects")} className="border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-50">Cancel</button>
          <button onClick={saveSubject} className="bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors">Save Subject</button>
        </div>
      </div>

      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Subject Details</h1>
        <p className="text-gray-400 text-sm mb-8">Fill in the core information required to introduce a new subject into the curriculum.</p>

        <div className="grid grid-cols-3 gap-6">
          {/* Form */}
          <div className="col-span-2 space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Subject Name</label>
                  <input value={sf.name} onChange={(e) => setSf((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Environmental Science" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Subject Code</label>
                  <input value={sf.code} onChange={(e) => setSf((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. ENV-202" className={inputCls} />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Grade Level</label>
                <div className="relative">
                  <select value={sf.gradeLevel} onChange={(e) => setSf((f) => ({ ...f, gradeLevel: e.target.value }))} className={`${inputCls} appearance-none cursor-pointer`}>
                    <option value="">Select Grade</option>
                    {["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"].map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><I.ChevDown /></span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Description</label>
                <textarea value={sf.description} onChange={(e) => setSf((f) => ({ ...f, description: e.target.value }))} rows={4}
                  placeholder="Provide a brief overview of the learning outcomes and scope..." className={`${inputCls} resize-none`} />
              </div>
            </div>

            {/* Curriculum Compliance */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">Curriculum Compliance</div>
                  <div className="text-gray-400 text-xs">This subject will be auto-mapped to national standards.</div>
                </div>
              </div>
              <button className="text-green-600 text-sm font-semibold hover:text-green-700">View Guidelines</button>
            </div>

            {sfError && <p className="text-red-500 text-sm bg-red-50 px-4 py-3 rounded-xl">{sfError}</p>}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Illustration upload */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <div className="font-semibold text-gray-800 text-sm mb-3">Subject Illustration</div>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center text-gray-300 hover:border-orange-300 hover:text-orange-300 cursor-pointer transition-colors">
                <I.Image />
                <div className="font-semibold text-sm mt-3 text-gray-500">Upload Icon</div>
                <div className="text-xs text-gray-400 mt-1">PNG, JPG or SVG (Max 2MB)</div>
              </div>
            </div>

            {/* Visibility Settings */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <div className="font-semibold text-gray-800 text-sm mb-4">Visibility Settings</div>
              {[
                { label: "Draft Mode", key: "draftMode" as const },
                { label: "Visible to Students", key: "visibleToStudents" as const },
              ].map(({ label, key }) => (
                <div key={label} className="flex items-center justify-between mb-3 last:mb-0">
                  <span className="text-sm text-gray-600">{label}</span>
                  <button onClick={() => setSf((f) => ({ ...f, [key]: !f[key] }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${sf[key] ? "bg-green-500" : "bg-gray-200"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sf[key] ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Quote card */}
            <div className="rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-br from-teal-600 to-teal-800 p-5 flex flex-col justify-end min-h-[140px]">
                <p className="text-white text-xs italic leading-relaxed">&quot;Education is the most powerful weapon which you can use to change the world.&quot;</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── 3. Chapters View ────────────────────────────────────────────────────────

  const chaptersFiltered = selectedSubject?.chapters ?? [];
  const totalChapters = chaptersFiltered.length;
  const publishedCount = chaptersFiltered.filter((c) => c.status === "Published").length;
  const draftCount = chaptersFiltered.filter((c) => c.status === "Draft").length;
  const totalChapterPages = Math.max(1, Math.ceil(totalChapters / CHAPTER_PER_PAGE));
  const paginatedChapters = chaptersFiltered.slice((chapterPage - 1) * CHAPTER_PER_PAGE, chapterPage * CHAPTER_PER_PAGE);

  const ChaptersView = selectedSubject && (
    <div className="flex-1 overflow-y-auto">
      {/* Sub-topbar */}
      <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => setView("subjects")} className="text-gray-400 hover:text-gray-600 flex items-center gap-1"><I.ArrowL /><span>Subjects</span></button>
          <span className="text-gray-300">›</span>
          <span className="font-semibold text-gray-700">{selectedSubject.name} ({selectedSubject.gradeLevel})</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative text-gray-500 hover:text-gray-700"><I.Bell /></button>
          <div className="text-sm font-medium text-gray-700">Prof. Anderson · Math Department</div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white text-xs font-bold">PA</div>
        </div>
      </div>

      <div className="p-8">
        {/* Breadcrumb tags */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold uppercase bg-gray-800 text-white px-2.5 py-1 rounded-full tracking-wide">ADVANCED</span>
          <span className="text-sm text-gray-500">Curriculum Manager</span>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manage Chapters</h1>
            <p className="text-gray-400 text-sm mt-0.5">Structure and organize your {selectedSubject.name.toLowerCase()} modules for the 2024 academic year.</p>
          </div>
          <button onClick={() => setShowAddChapterModal(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full transition-colors shadow-sm">
            <I.Plus /> Add New Chapter
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "TOTAL CHAPTERS", value: totalChapters, bg: "bg-white", icon: <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-400"><I.Book /></div> },
            { label: "PUBLISHED", value: publishedCount, bg: "bg-white", icon: <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-500"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg></div> },
            { label: "DRAFTS", value: draftCount, bg: "bg-white", icon: <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div> },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4`}>
              {s.icon}
              <div>
                <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{s.label}</div>
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Chapter table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["#", "Chapter Name", "Status", "Lesson Count", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedChapters.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-12 text-sm">No chapters yet. Add your first chapter.</td></tr>
              ) : paginatedChapters.map((ch, i) => (
                <tr key={ch.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-semibold text-gray-300">
                    {String((chapterPage - 1) * CHAPTER_PER_PAGE + i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-gray-800 text-sm">{ch.name}</div>
                    {ch.description && <div className="text-gray-400 text-xs mt-0.5">{ch.description}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggleChapterStatus(ch.id)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full cursor-pointer transition-colors ${ch.status === "Published" ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${ch.status === "Published" ? "bg-green-500" : "bg-gray-400"}`} />
                      {ch.status}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {ch.lessonCount} Lessons
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openLessonEditor(ch)} className="text-xs font-semibold text-orange-500 hover:text-orange-700">Edit Lessons</button>
                      <button onClick={() => deleteChapter(ch.id)} className="text-gray-300 hover:text-red-400"><I.Trash /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Table footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
            <span className="text-xs text-gray-400">Showing {paginatedChapters.length > 0 ? (chapterPage - 1) * CHAPTER_PER_PAGE + 1 : 0}–{Math.min(chapterPage * CHAPTER_PER_PAGE, totalChapters)} of {totalChapters} chapters</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setChapterPage((p) => Math.max(1, p - 1))} disabled={chapterPage === 1} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30"><I.ArrowL /></button>
              {Array.from({ length: Math.min(totalChapterPages, 3) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setChapterPage(p)} className={`w-7 h-7 rounded-full text-xs font-medium ${chapterPage === p ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{p}</button>
              ))}
              <button onClick={() => setChapterPage((p) => Math.min(totalChapterPages, p + 1))} disabled={chapterPage === totalChapterPages} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30"><I.ArrowR /></button>
            </div>
          </div>
        </div>

        {/* Syllabus card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-400"><I.PDF /></div>
            <div>
              <div className="font-semibold text-gray-800 text-sm">2024 {selectedSubject.name} Syllabus.pdf</div>
              <div className="text-gray-400 text-xs">Last updated: Oct 24, 2023</div>
            </div>
          </div>
          <button className="border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-50">View Full Syllabus</button>
        </div>
      </div>

      {/* Add Chapter Modal */}
      {showAddChapterModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Add New Chapter</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Chapter Name *</label>
                <input value={chapterForm.name} onChange={(e) => setChapterForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Introduction to Calculus" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
                <input value={chapterForm.description} onChange={(e) => setChapterForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief summary of this chapter" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Status</label>
                <div className="relative">
                  <select value={chapterForm.status} onChange={(e) => setChapterForm((f) => ({ ...f, status: e.target.value as ChapterStatus }))} className={`${inputCls} appearance-none`}>
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><I.ChevDown /></span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={addChapterFull} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">Add Chapter</button>
              <button onClick={() => { setShowAddChapterModal(false); setChapterForm({ name: "", description: "", status: "Draft" }); }} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── 4. Lesson Editor View ───────────────────────────────────────────────────

  const LessonEditorView = selectedChapter && selectedSubject && (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor topbar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <button onClick={() => setView("subjects")} className="hover:text-gray-600">{selectedSubject.name}</button>
          <span>›</span>
          <button onClick={() => setView("chapters")} className="hover:text-gray-600">{selectedChapter.name}</button>
          <span>›</span>
          <span className="text-gray-700 font-medium">{lessonTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="border border-orange-300 text-orange-500 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-orange-50 flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            Preview as Student
          </button>
          <button className="border border-gray-200 text-gray-600 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-gray-50 flex items-center gap-1.5"><I.Gear />Lesson Settings</button>
          <button onClick={saveLessonAndBack} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">Publish Lesson</button>
        </div>
      </div>

      {/* Lesson title + tabs */}
      <div className="bg-white px-8 pt-5 pb-0 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)}
              className="text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 w-full" />
            <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              All changes saved automatically.
            </p>
          </div>
        </div>
        <div className="flex gap-1 mt-4">
          {["Content Editor", "Resources", "Analytics"].map((t, i) => (
            <button key={t} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${i === 0 ? "border-orange-500 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 flex overflow-hidden bg-gray-50">
        {/* Left: Outline */}
        <div className="w-56 shrink-0 bg-white border-r border-gray-100 flex flex-col p-4 overflow-y-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Lesson Outline</p>
          <div className="space-y-1 flex-1">
            {sections.map((sec, idx) => (
              <button key={sec.id} onClick={() => setActiveSection(idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${activeSection === idx ? "bg-orange-50 text-orange-600 font-semibold" : "text-gray-500 hover:bg-gray-50"}`}>
                <span className={`flex-shrink-0 ${activeSection === idx ? "text-orange-500" : "text-gray-300"}`}>
                  {sectionIcon(sec.type)}
                </span>
                <span className="text-xs truncate">{idx + 1}. {sec.title}</span>
              </button>
            ))}
          </div>

          {addingSection ? (
            <div className="mt-3 space-y-2">
              <input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="Section title..." className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200" />
              <div className="flex gap-1">
                {(["video", "reading", "mcq"] as SectionType[]).map((t) => (
                  <button key={t} onClick={() => setNewSectionType(t)} className={`flex-1 text-[10px] py-1 rounded-lg font-medium ${newSectionType === t ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"}`}>
                    {t === "video" ? "Video" : t === "reading" ? "Text" : "MCQ"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={addNewSection} className="flex-1 bg-orange-500 text-white text-xs py-1.5 rounded-lg">Add</button>
                <button onClick={() => setAddingSection(false)} className="flex-1 bg-gray-100 text-gray-500 text-xs py-1.5 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingSection(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-200 rounded-xl py-2.5 text-xs text-gray-400 hover:text-orange-400 hover:border-orange-200 transition-colors">
              <I.Plus /> Add New Section
            </button>
          )}
        </div>

        {/* Right: Section content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {sections.map((sec, idx) => (
            <div key={sec.id} className={`bg-white rounded-2xl border shadow-sm transition-shadow ${activeSection === idx ? "border-orange-200 shadow-md" : "border-gray-100"}`}
              onClick={() => setActiveSection(idx)}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${sectionBg(sec.type)}`}>
                    {sectionIcon(sec.type)}
                  </div>
                  <span className="font-semibold text-gray-800">{idx + 1}. {sec.title}</span>
                  {sec.type === "mcq" && sec.questions.length > 0 && (
                    <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{sec.questions.length} Question{sec.questions.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                <button className="text-gray-300 hover:text-gray-500"><I.Dots /></button>
              </div>

              <div className="p-6">
                {/* VIDEO SECTION */}
                {sec.type === "video" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center text-gray-300 hover:border-orange-300 hover:text-orange-300 cursor-pointer transition-colors">
                      <I.Upload />
                      <div className="font-semibold text-sm mt-3 text-gray-500">Upload Video File</div>
                      <div className="text-xs text-gray-400 mt-1">MP4, MOV up to 500MB</div>
                    </div>
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center text-gray-300 hover:border-orange-300 hover:text-orange-300 cursor-pointer transition-colors">
                      <I.Link />
                      <div className="font-semibold text-sm mt-3 text-gray-500">Embed from URL</div>
                      <div className="text-xs text-gray-400 mt-1">YouTube or Vimeo Link</div>
                    </div>
                    {sec.videoUrl && (
                      <div className="col-span-2 bg-gray-50 rounded-xl p-3 text-sm text-gray-600 border border-gray-200">URL: {sec.videoUrl}</div>
                    )}
                  </div>
                )}

                {/* READING SECTION */}
                {sec.type === "reading" && (
                  <div>
                    {/* Toolbar */}
                    <div className="flex items-center gap-1 mb-3 pb-2 border-b border-gray-100">
                      {["B", "I"].map((t) => (
                        <button key={t} className={`w-7 h-7 rounded text-sm font-bold text-gray-500 hover:bg-gray-100 ${t === "B" ? "font-bold" : "italic"}`}>{t}</button>
                      ))}
                      <div className="w-px h-5 bg-gray-200 mx-1" />
                      <button className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 flex items-center justify-center">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      </button>
                      <button className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 flex items-center justify-center"><I.Image /></button>
                      <button className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 flex items-center justify-center"><I.Link /></button>
                      <div className="ml-auto">
                        <button className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 flex items-center justify-center text-xs font-mono">&lt;/&gt;</button>
                      </div>
                    </div>
                    <textarea value={sec.content} onChange={(e) => updateSectionContent(idx, e.target.value)}
                      rows={6} placeholder="Write your lesson content here..."
                      className="w-full text-sm text-gray-700 focus:outline-none resize-none placeholder:text-gray-300" />
                  </div>
                )}

                {/* MCQ SECTION */}
                {sec.type === "mcq" && (
                  <div className="space-y-4">
                    {sec.questions.map((q, qi) => (
                      <div key={q.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <span className="text-xs font-semibold text-gray-400">Question {qi + 1}</span>
                          <div className="flex gap-2">
                            <button className="text-gray-300 hover:text-gray-500"><I.Edit /></button>
                            <button onClick={() => deleteQuestion(idx, q.id)} className="text-gray-300 hover:text-red-400"><I.Trash /></button>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-sm text-gray-800 mb-3">{q.question}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {q.options.map((opt, oi) => (
                              <div key={oi} className={`text-sm px-3 py-2 rounded-lg border ${oi === q.correctIndex ? "border-green-300 bg-green-50 text-green-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                                {String.fromCharCode(65 + oi)}. {opt}{oi === q.correctIndex ? " (Correct)" : ""}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add Question form */}
                    {addingQuestion && activeSection === idx ? (
                      <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
                        <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-3">New Question</p>
                        <input value={qForm.question} onChange={(e) => setQForm((f) => ({ ...f, question: e.target.value }))}
                          placeholder="Enter your question..." className={`${inputCls} mb-3`} />
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {(["o0", "o1", "o2", "o3"] as const).map((k, i) => (
                            <div key={k} className="relative">
                              <input value={qForm[k]} onChange={(e) => setQForm((f) => ({ ...f, [k]: e.target.value }))}
                                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                className={`${inputCls} pr-8 ${qForm.correct === i ? "border-green-400 bg-green-50" : ""}`} />
                              <button onClick={() => setQForm((f) => ({ ...f, correct: i }))}
                                className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 transition-colors ${qForm.correct === i ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                                {qForm.correct === i && <I.Check />}
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mb-3">Click the circle to mark correct answer</p>
                        <div className="flex gap-2">
                          <button onClick={addQuestion} className="flex-1 bg-orange-500 text-white text-sm py-2 rounded-lg hover:bg-orange-600">Save Question</button>
                          <button onClick={() => { setAddingQuestion(false); setQForm({ question: "", o0: "", o1: "", o2: "", o3: "", correct: 0 }); }} className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setActiveSection(idx); setAddingQuestion(true); }}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:text-orange-400 hover:border-orange-200 transition-colors flex items-center justify-center gap-2">
                        <I.Plus /> Add Question
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between text-sm text-gray-400 py-4">
            <span className="italic">All changes saved automatically.</span>
            <button onClick={saveLessonAndBack} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-full transition-colors tracking-wide">
              SAVE AND CONTINUE
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Shell ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {Sidebar}
      <main className="flex-1 flex flex-col overflow-hidden">
        {TopBar}
        {view === "subjects" && SubjectsView}
        {view === "add-subject" && AddSubjectView}
        {view === "chapters" && ChaptersView}
        {view === "lesson-editor" && LessonEditorView}
      </main>
    </div>
  );
}
