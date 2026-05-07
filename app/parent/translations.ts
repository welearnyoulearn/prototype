export type Lang = 'en' | 'te'

const en = {
  // Auth
  parentPortal: 'Parent Portal',
  tagline: "Track your child's schedule, fees, exams, and more",
  searchSchool: 'Search your school',
  typeSchool: 'Type school name...',
  verifyChild: 'Verify your child',
  verifySubtitle: "Enter your child's roll number and your registered phone number",
  rollNumber: "Child's Roll Number",
  rollPlaceholder: 'e.g. 2024-08A-001',
  phoneNumber: 'Your Phone Number',
  phonePlaceholder: 'Registered parent phone',
  verifying: 'Verifying...',
  accessDashboard: 'Access Dashboard',
  back: '← Back',
  searching: 'Searching...',

  // Header
  home: '← Home',
  grade: 'Grade',
  section: 'Section',
  roll: 'Roll',
  resultsToSign: (n: number) => `${n} result${n > 1 ? 's' : ''} to sign ✍`,
  feeOverdue: (n: number) => `${n} fee overdue`,
  switchChild: 'Switch child',

  // Nav
  nav: {
    overview:     'Overview',
    today:        "Today's Schedule",
    syllabus:     'Syllabus',
    attendance:   'Attendance',
    fees:         'Fees',
    exams:        'Exam Calendar',
    results:      'Results',
    'weekly-tests': 'Weekly Tests',
    activity:     'Activity Log',
    'ai-chats':   'AI Chat History',
  },

  // Language
  language: 'Language',

  // Overview
  yourChild: 'Your Child',
  thisMonth: 'This month',
  todaysPeriods: "Today's Periods",
  upcomingExams: 'Upcoming Exams',
  pendingSignoff: 'Pending Sign-off',
  outstandingFees: 'Outstanding Fees',
  thisWeeksTest: "This Week's Test",
  excellent: '🌟 Excellent!',
  goodEffort: '👍 Good effort',
  needsRevision: '📖 Needs revision',
  latestResult: 'Latest Result',
  viewFullCalendar: 'View full calendar →',
  signOffNeeded: 'sign-off needed',
  signNow: 'Sign now',
  recentTasks: 'Recent Tasks',
  due: 'Due',
  done: 'Done',
  pending: 'Pending',
  schoolNotices: 'School Notices',
  urgent: 'Urgent',
  today: 'Today',
  tomorrow: 'Tomorrow',
  daysAway: (n: number) => `${n} days`,
  notices: (n: number) => `${n} notice${n > 1 ? 's' : ''}`,
  moreNotices: (n: number) => `+${n} more notice${n > 1 ? 's' : ''}`,
  expires: 'Expires:',

  // Today's schedule
  refresh: 'Refresh',
  noTimetableToday: 'No timetable for today',
  noTimetableHint: 'It may be a holiday or timetable is not set up yet',
  freePeriod: 'Free Period',
  now: 'NOW',

  // Syllabus
  syllabusProgress: 'Syllabus Progress',
  syllabusSubtitle: 'Track what topics your child has covered in each subject',

  // Attendance
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  attendancePct: 'Attendance %',
  monthlyBreakdown: 'Monthly Breakdown',
  recentDays: 'Recent Days',
  noData: 'No data',
  noAttendance: 'No attendance data available',

  // Fees
  feeDetails: 'Fee Details',
  totalDue: 'Total Due',
  paid: 'Paid',
  outstanding: 'Outstanding',
  payOnline: 'Pay Online',
  balance: 'Balance:',
  paymentVerifyHint: 'Payment will be verified by school admin',
  amount: 'Amount (₹)',
  upiRef: 'UPI ID / Ref (optional)',
  submitPayment: (amt: string) => `Submit Payment of ${amt}`,
  submitting: 'Submitting…',
  cancel: 'Cancel',
  feeLedger: 'Fee Ledger',
  paymentHistory: 'Payment History',
  paymentSuccess: 'Payment submitted successfully!',
  receipt: 'Receipt:',
  adminVerify: 'Admin will verify shortly',
  pendingVerify: 'Pending verify',
  confirmed: 'Confirmed',
  noFeeEntries: (yr: string) => `No fee entries for ${yr}`,
  pay: 'Pay',
  dueDate: 'Due',

  // Exams
  examCalendar: 'Exam Calendar',
  subjects: 'Subjects:',
  noUpcomingExams: 'No upcoming exams scheduled',

  // Results
  parentSignoff: 'Parent Sign-off',
  acknowledged: 'Acknowledged',
  yourName: 'Your name',
  confirm: 'Confirm',
  noResults: 'No published results yet',
  passing: 'Pass',

  // Weekly tests
  weeklyTests: 'Weekly Tests',
  noTestHistory: 'No test history yet',
  score: 'Score',
  submitted: 'Submitted',
  missed: 'Missed',

  // Activity
  activityLog: 'Activity Log',
  lastDays: (n: number) => `Last ${n} days`,
  noActivity: 'No activity recorded',
  sessions: 'Sessions',
  minutes: 'Minutes',

  // AI Chats
  aiChatHistory: 'AI Chat History',
  noChats: 'No chat sessions yet',

  // Result sign-off modal
  signoffTitle: 'Sign-off Required',
  signoffHint: 'Enter your name to acknowledge these results',
  saving: 'Saving...',
}

const te: typeof en = {
  // Auth
  parentPortal: 'తల్లిదండ్రుల పోర్టల్',
  tagline: 'మీ పిల్లల వేళాపట్టిక, రుసుములు, పరీక్షలు మరియు మరిన్నింటిని ట్రాక్ చేయండి',
  searchSchool: 'మీ పాఠశాల వెతకండి',
  typeSchool: 'పాఠశాల పేరు టైప్ చేయండి...',
  verifyChild: 'మీ పిల్లవాడిని ధృవీకరించండి',
  verifySubtitle: 'మీ పిల్లవాని హాజరు సంఖ్య మరియు మీ నమోదిత ఫోన్ నంబర్ నమోదు చేయండి',
  rollNumber: 'పిల్లవాని హాజరు సంఖ్య',
  rollPlaceholder: 'ఉదా: 2024-08A-001',
  phoneNumber: 'మీ ఫోన్ నంబర్',
  phonePlaceholder: 'నమోదిత తల్లిదండ్రుల ఫోన్',
  verifying: 'ధృవీకరిస్తున్నారు...',
  accessDashboard: 'డాష్‌బోర్డ్ తెరవండి',
  back: '← వెనక్కు',
  searching: 'వెతుకుతున్నారు...',

  // Header
  home: '← హోమ్',
  grade: 'తరగతి',
  section: 'విభాగం',
  roll: 'హాజరు సంఖ్య',
  resultsToSign: (n: number) => `${n} ఫలితాలకు సంతకం అవసరం ✍`,
  feeOverdue: (n: number) => `${n} రుసుము ఆలస్యం`,
  switchChild: 'వేరే పిల్లవాడు',

  // Nav
  nav: {
    overview:     'అవలోకనం',
    today:        'నేటి వేళాపట్టిక',
    syllabus:     'పాఠ్యక్రమం',
    attendance:   'హాజరు',
    fees:         'రుసుములు',
    exams:        'పరీక్షల పంచాంగం',
    results:      'ఫలితాలు',
    'weekly-tests': 'వారపు పరీక్షలు',
    activity:     'కార్యకలాప నమోదు',
    'ai-chats':   'AI చాట్ చరిత్ర',
  },

  // Language
  language: 'భాష',

  // Overview
  yourChild: 'మీ పిల్లవాడు',
  thisMonth: 'ఈ నెల',
  todaysPeriods: 'నేటి తరగతులు',
  upcomingExams: 'రాబోయే పరీక్షలు',
  pendingSignoff: 'సంతకం పెండింగ్',
  outstandingFees: 'బాకీ రుసుములు',
  thisWeeksTest: 'ఈ వారం పరీక్ష',
  excellent: '🌟 అద్భుతం!',
  goodEffort: '👍 మంచి ప్రయత్నం',
  needsRevision: '📖 పునర్విమర్శ అవసరం',
  latestResult: 'తాజా ఫలితం',
  viewFullCalendar: 'పూర్తి పంచాంగం చూడండి →',
  signOffNeeded: 'సంతకం అవసరం',
  signNow: 'ఇప్పుడే సంతకం',
  recentTasks: 'ఇటీవలి పనులు',
  due: 'గడువు',
  done: 'పూర్తయింది',
  pending: 'పెండింగ్',
  schoolNotices: 'పాఠశాల నోటీసులు',
  urgent: 'అత్యవసర',
  today: 'నేడు',
  tomorrow: 'రేపు',
  daysAway: (n: number) => `${n} రోజులు`,
  notices: (n: number) => `${n} నోటీసు${n > 1 ? 'లు' : ''}`,
  moreNotices: (n: number) => `+${n} మరిన్ని నోటీసులు`,
  expires: 'గడువు తేదీ:',

  // Today's schedule
  refresh: 'తాజాచేయి',
  noTimetableToday: 'నేటికి వేళాపట్టిక లేదు',
  noTimetableHint: 'సెలవు రోజు కావచ్చు లేదా వేళాపట్టిక ఏర్పాటు కాలేదు',
  freePeriod: 'విరామ వ్యవధి',
  now: 'ఇప్పుడు',

  // Syllabus
  syllabusProgress: 'పాఠ్యక్రమ పురోగతి',
  syllabusSubtitle: 'మీ పిల్లలు ప్రతి విషయంలో ఏ అంశాలు చదివారో తెలుసుకోండి',

  // Attendance
  present: 'హాజరు',
  absent: 'గైర్హాజరు',
  late: 'ఆలస్యం',
  attendancePct: 'హాజరు శాతం',
  monthlyBreakdown: 'నెలవారీ వివరాలు',
  recentDays: 'ఇటీవలి రోజులు',
  noData: 'డేటా లేదు',
  noAttendance: 'హాజరు డేటా అందుబాటులో లేదు',

  // Fees
  feeDetails: 'రుసుముల వివరాలు',
  totalDue: 'చెల్లించాల్సిన మొత్తం',
  paid: 'చెల్లించారు',
  outstanding: 'బాకీ',
  payOnline: 'ఆన్‌లైన్‌లో చెల్లించు',
  balance: 'మిగిలిన మొత్తం:',
  paymentVerifyHint: 'చెల్లింపు పాఠశాల నిర్వాహకుడు ధృవీకరిస్తారు',
  amount: 'మొత్తం (₹)',
  upiRef: 'UPI ID / రెఫరెన్స్ (ఐచ్ఛికం)',
  submitPayment: (amt: string) => `${amt} చెల్లించు`,
  submitting: 'సమర్పిస్తున్నారు…',
  cancel: 'రద్దు',
  feeLedger: 'రుసుముల పుస్తకం',
  paymentHistory: 'చెల్లింపు చరిత్ర',
  paymentSuccess: 'చెల్లింపు విజయవంతంగా సమర్పించబడింది!',
  receipt: 'రసీదు:',
  adminVerify: 'నిర్వాహకుడు త్వరలో ధృవీకరిస్తారు',
  pendingVerify: 'ధృవీకరణ పెండింగ్',
  confirmed: 'నిర్ధారించబడింది',
  noFeeEntries: (yr: string) => `${yr} కి రుసుము వివరాలు లేవు`,
  pay: 'చెల్లించు',
  dueDate: 'గడువు',

  // Exams
  examCalendar: 'పరీక్షల పంచాంగం',
  subjects: 'విషయాలు:',
  noUpcomingExams: 'రాబోయే పరీక్షలు ఏమీ లేవు',

  // Results
  parentSignoff: 'తల్లిదండ్రుల సంతకం',
  acknowledged: 'నిర్ధారించబడింది',
  yourName: 'మీ పేరు',
  confirm: 'నిర్ధారించు',
  noResults: 'ఇంకా ఫలితాలు ప్రచురించబడలేదు',
  passing: 'పాస్',

  // Weekly tests
  weeklyTests: 'వారపు పరీక్షలు',
  noTestHistory: 'ఇంకా పరీక్ష చరిత్ర లేదు',
  score: 'మార్కులు',
  submitted: 'సమర్పించారు',
  missed: 'తప్పిపోయారు',

  // Activity
  activityLog: 'కార్యకలాప నమోదు',
  lastDays: (n: number) => `చివరి ${n} రోజులు`,
  noActivity: 'కార్యకలాపం నమోదు కాలేదు',
  sessions: 'సెషన్‌లు',
  minutes: 'నిమిషాలు',

  // AI Chats
  aiChatHistory: 'AI చాట్ చరిత్ర',
  noChats: 'ఇంకా చాట్ సెషన్‌లు లేవు',

  // Result sign-off modal
  signoffTitle: 'సంతకం అవసరం',
  signoffHint: 'ఈ ఫలితాలను ధృవీకరించడానికి మీ పేరు నమోదు చేయండి',
  saving: 'సేవ్ అవుతున్నది...',
}

export const TRANSLATIONS = { en, te }
