// Predefined curriculum syllabi for CBSE and APSSC

export type SubjectSyllabus = {
  name: string
  topics: string[]
}

export type GradeSyllabus = {
  grade: string
  subjects: SubjectSyllabus[]
}

export const CURRICULA: Record<string, GradeSyllabus[]> = {
  CBSE: [
    {
      grade: '1',
      subjects: [
        { name: 'English', topics: ['Letters & Sounds', 'Reading', 'Writing', 'Basic Grammar', 'Comprehension'] },
        { name: 'Hindi', topics: ['वर्णमाला', 'मात्राएँ', 'शब्द', 'वाक्य', 'कविता'] },
        { name: 'Mathematics', topics: ['Numbers 1-100', 'Addition', 'Subtraction', 'Shapes', 'Measurement'] },
        { name: 'Environmental Studies', topics: ['My Family', 'Animals', 'Plants', 'Food', 'Seasons'] },
        { name: 'Art & Craft', topics: ['Drawing', 'Coloring', 'Paper Craft', 'Clay Work'] },
        { name: 'Physical Education', topics: ['Games', 'Yoga', 'Exercise', 'Sports'] },
      ],
    },
    {
      grade: '2',
      subjects: [
        { name: 'English', topics: ['Reading Comprehension', 'Writing Sentences', 'Nouns & Verbs', 'Stories'] },
        { name: 'Hindi', topics: ['अनुस्वार', 'संयुक्ताक्षर', 'पाठ', 'अनुच्छेद', 'कविता'] },
        { name: 'Mathematics', topics: ['Numbers to 1000', 'Addition & Subtraction', 'Multiplication Intro', 'Time', 'Data Handling'] },
        { name: 'Environmental Studies', topics: ['Community Helpers', 'Transport', 'Water', 'Air', 'Our Earth'] },
        { name: 'Art & Craft', topics: ['Drawing', 'Pattern Making', 'Best Out of Waste'] },
        { name: 'Physical Education', topics: ['Athletics', 'Team Games', 'Dance', 'Fitness'] },
      ],
    },
    {
      grade: '3',
      subjects: [
        { name: 'English', topics: ['Reading', 'Grammar – Tenses', 'Composition', 'Vocabulary', 'Comprehension'] },
        { name: 'Hindi', topics: ['व्याकरण', 'निबंध', 'पत्र लेखन', 'पाठ', 'कहानी'] },
        { name: 'Mathematics', topics: ['Large Numbers', 'Multiplication', 'Division', 'Fractions Intro', 'Geometry'] },
        { name: 'Environmental Studies', topics: ['Maps', 'Food & Nutrition', 'Shelter', 'Animals & Birds', 'Safety'] },
        { name: 'Computer Science', topics: ['Parts of Computer', 'MS Paint', 'Keyboard & Mouse', 'Internet Basics'] },
        { name: 'Physical Education', topics: ['Athletics', 'Sports', 'Yoga', 'First Aid Basics'] },
      ],
    },
    {
      grade: '4',
      subjects: [
        { name: 'English', topics: ['Advanced Grammar', 'Essay Writing', 'Poetry', 'Comprehension', 'Vocabulary'] },
        { name: 'Hindi', topics: ['व्याकरण', 'पत्र', 'निबंध', 'कहानी', 'कविता'] },
        { name: 'Mathematics', topics: ['Fractions', 'Decimals Intro', 'Geometry', 'Measurement', 'Area & Perimeter'] },
        { name: 'Environmental Studies', topics: ['States of India', 'Government', 'Natural Resources', 'Pollution'] },
        { name: 'Computer Science', topics: ['MS Word', 'MS Excel Intro', 'Logo', 'Algorithms Basics'] },
        { name: 'Physical Education', topics: ['Team Sports', 'Swimming', 'Athletics', 'Health & Hygiene'] },
      ],
    },
    {
      grade: '5',
      subjects: [
        { name: 'English', topics: ['Literature', 'Advanced Writing', 'Grammar – All Tenses', 'Debate', 'Letter'] },
        { name: 'Hindi', topics: ['साहित्य', 'व्याकरण', 'निबंध', 'पत्र', 'संधि व समास'] },
        { name: 'Mathematics', topics: ['HCF & LCM', 'Fractions', 'Decimals', 'Percentage Intro', 'Volume & Area'] },
        { name: 'Environmental Studies', topics: ['India – Geography', 'History Intro', 'Ecosystems', 'Civics'] },
        { name: 'Computer Science', topics: ['Spreadsheets', 'Presentations', 'HTML Basics', 'Digital Safety'] },
      ],
    },
    {
      grade: '6',
      subjects: [
        { name: 'English', topics: ['Prose & Poetry', 'Writing Skills', 'Grammar', 'Vocabulary', 'Comprehension'] },
        { name: 'Hindi', topics: ['गद्य व पद्य', 'व्याकरण', 'निबंध', 'पत्र', 'संस्कृत परिचय'] },
        { name: 'Mathematics', topics: ['Integers', 'Fractions & Decimals', 'Algebra Intro', 'Geometry', 'Data Handling'] },
        { name: 'Science', topics: ['Food', 'Components of Food', 'Fibre to Fabric', 'Sorting Materials', 'Separation', 'Living Organisms', 'Motion & Measurement'] },
        { name: 'Social Science', topics: ['History – Ancient India', 'Geography – Earth', 'Civics – Government'] },
        { name: 'Sanskrit', topics: ['Introduction', 'Shloka', 'Basic Grammar', 'Vocabulary'] },
        { name: 'Computer Science', topics: ['Computer Fundamentals', 'MS Office', 'Internet', 'Scratch Programming'] },
      ],
    },
    {
      grade: '7',
      subjects: [
        { name: 'English', topics: ['Advanced Reading', 'Writing', 'Grammar – Advanced', 'Poetry', 'Formal Letters'] },
        { name: 'Hindi', topics: ['साहित्य', 'व्याकरण', 'रचना', 'संस्कृत सहपाठी'] },
        { name: 'Mathematics', topics: ['Integers', 'Fractions', 'Data Handling', 'Simple Equations', 'Lines & Angles', 'Triangles', 'Perimeter & Area', 'Exponents'] },
        { name: 'Science', topics: ['Nutrition', 'Heat', 'Acids & Bases', 'Physical & Chemical Changes', 'Weather', 'Respiration', 'Transportation', 'Reproduction', 'Motion & Time', 'Light'] },
        { name: 'Social Science', topics: ['Medieval India', 'Inside the Earth', 'Our Changing Earth', 'State Government', 'Gender Equality'] },
        { name: 'Sanskrit', topics: ['Grammar', 'Prose', 'Shloka', 'Translation'] },
      ],
    },
    {
      grade: '8',
      subjects: [
        { name: 'English', topics: ['Honeydew', 'It So Happened', 'Grammar', 'Composition', 'Media Literacy'] },
        { name: 'Hindi', topics: ['वसंत', 'दूर्वा', 'भारत की खोज', 'व्याकरण', 'लेखन'] },
        { name: 'Mathematics', topics: ['Rational Numbers', 'Linear Equations', 'Squares & Cubes', 'Comparing Quantities', 'Algebraic Expressions', 'Mensuration', 'Data Handling', 'Introduction to Graphs', 'Direct & Inverse'] },
        { name: 'Science', topics: ['Crop Production', 'Microorganisms', 'Metals & Non-metals', 'Coal & Petroleum', 'Combustion', 'Cell', 'Friction', 'Sound', 'Light', 'Pollution of Air & Water'] },
        { name: 'Social Science', topics: ['How When & Where', 'From Trade to Territory', 'Resources', 'Agriculture', 'Industries', 'Indian Constitution', 'Parliament'] },
        { name: 'Sanskrit', topics: ['Ruchira', 'Grammar – Advanced', 'Shloka', 'Composition'] },
      ],
    },
    {
      grade: '9',
      subjects: [
        { name: 'English', topics: ['Beehive', 'Moments', 'Grammar & Writing', 'Listening & Speaking', 'Literature Analysis'] },
        { name: 'Hindi', topics: ['क्षितिज', 'कृतिका', 'व्याकरण', 'लेखन', 'पठन'] },
        { name: 'Mathematics', topics: ['Number Systems', 'Polynomials', 'Coordinate Geometry', 'Linear Equations', 'Triangles', 'Quadrilaterals', 'Circles', 'Statistics', 'Probability'] },
        { name: 'Physics', topics: ['Motion', 'Force & Laws of Motion', 'Gravitation', 'Work & Energy', 'Sound'] },
        { name: 'Chemistry', topics: ['Matter in Our Surroundings', 'Is Matter Around Us Pure', 'Atoms & Molecules', 'Structure of Atom'] },
        { name: 'Biology', topics: ['Cell', 'Tissues', 'Diversity in Living Organisms', 'Health & Disease', 'Natural Resources', 'Food Production'] },
        { name: 'Social Science', topics: ['French Revolution', 'Socialism & Russia', 'Nazism', 'Forest Society', 'India – Size & Location', 'Physical Features', 'Climate', 'Poverty', 'Constitution', 'Electoral Politics'] },
        { name: 'Computer Applications', topics: ['Computer Fundamentals', 'Software', 'Python Basics', 'Database Introduction'] },
      ],
    },
    {
      grade: '10',
      subjects: [
        { name: 'English', topics: ['First Flight', 'Footprints Without Feet', 'Grammar', 'Writing – Letter/Essay/Report', 'Literature Appreciation'] },
        { name: 'Hindi', topics: ['क्षितिज-2', 'कृतिका-2', 'व्याकरण', 'लेखन – निबंध/पत्र/सूचना', 'वाचन'] },
        { name: 'Mathematics', topics: ['Real Numbers', 'Polynomials', 'Pair of Linear Equations', 'Quadratic Equations', 'Arithmetic Progressions', 'Triangles', 'Coordinate Geometry', 'Trigonometry', 'Circles', 'Areas', 'Surface Areas & Volumes', 'Statistics', 'Probability'] },
        { name: 'Physics', topics: ['Light – Reflection & Refraction', 'Human Eye', 'Electricity', 'Magnetic Effects', 'Sources of Energy'] },
        { name: 'Chemistry', topics: ['Chemical Reactions', 'Acids Bases Salts', 'Metals & Non-metals', 'Carbon & Compounds', 'Periodic Classification'] },
        { name: 'Biology', topics: ['Life Processes', 'Control & Coordination', 'Reproduction', 'Heredity & Evolution', 'Environment'] },
        { name: 'Social Science', topics: ['Nationalism in Europe', 'Nationalist Movement in Asia', 'India Industrialisation', 'Print Culture', 'Resources & Development', 'Forest & Wildlife', 'Water Resources', 'Agriculture', 'Minerals', 'Manufacturing Industries', 'Power Sharing', 'Federalism', 'Democracy', 'Political Parties', 'Development', 'Money & Credit', 'Globalisation', 'Consumer Rights'] },
        { name: 'Computer Applications', topics: ['HTML', 'CSS', 'JavaScript Basics', 'Database – SQL', 'Networking'] },
      ],
    },
  ],
  APSSC: [
    {
      grade: '1',
      subjects: [
        { name: 'Telugu', topics: ['అక్షరాలు', 'పదాలు', 'వాక్యాలు', 'కవిత', 'కథలు'] },
        { name: 'English', topics: ['Alphabet', 'Words', 'Sentences', 'Rhymes', 'Stories'] },
        { name: 'Mathematics', topics: ['Numbers 1-50', 'Addition', 'Subtraction', 'Shapes', 'Patterns'] },
        { name: 'Environmental Science', topics: ['My Body', 'Family', 'Animals', 'Plants', 'Food'] },
        { name: 'Hindi', topics: ['अक्षर', 'शब्द', 'वाक्य', 'कविता'] },
      ],
    },
    {
      grade: '2',
      subjects: [
        { name: 'Telugu', topics: ['వాచకం', 'వ్యాకరణం', 'పద్యం', 'గద్యం'] },
        { name: 'English', topics: ['Reading', 'Writing', 'Vocabulary', 'Grammar Basics'] },
        { name: 'Mathematics', topics: ['Numbers to 100', 'Operations', 'Time & Money', 'Measurement'] },
        { name: 'Environmental Science', topics: ['Water', 'Air', 'Transport', 'Community', 'Safety'] },
        { name: 'Hindi', topics: ['वर्णमाला', 'पाठ', 'कविता', 'लेखन'] },
      ],
    },
    {
      grade: '6',
      subjects: [
        { name: 'Telugu', topics: ['గద్యం', 'పద్యం', 'వ్యాకరణం', 'రచన', 'పఠనం'] },
        { name: 'English', topics: ['Reading Comprehension', 'Grammar', 'Writing', 'Literature', 'Vocabulary'] },
        { name: 'Hindi', topics: ['गद्य', 'पद्य', 'व्याकरण', 'लेखन', 'पठन'] },
        { name: 'Mathematics', topics: ['Integers', 'Fractions', 'Ratio & Proportion', 'Basic Geometry', 'Mensuration', 'Data Handling'] },
        { name: 'Physical Science', topics: ['Motion', 'Force', 'Pressure', 'Sound', 'Light', 'Chemical Reactions', 'Matter'] },
        { name: 'Biological Science', topics: ['Cells', 'Tissues', 'Plants', 'Animals', 'Microbes', 'Food & Nutrition'] },
        { name: 'Social Studies', topics: ['India – Ancient History', 'Geography of India', 'Civics', 'Indian Economy'] },
      ],
    },
    {
      grade: '7',
      subjects: [
        { name: 'Telugu', topics: ['గద్యం', 'పద్యం', 'వ్యాకరణం', 'రచన'] },
        { name: 'English', topics: ['Reading', 'Grammar', 'Writing', 'Literature', 'Comprehension'] },
        { name: 'Hindi', topics: ['गद्य', 'पद्य', 'व्याकरण', 'लेखन'] },
        { name: 'Mathematics', topics: ['Number Theory', 'Algebra', 'Geometry', 'Statistics', 'Mensuration'] },
        { name: 'Physical Science', topics: ['Energy', 'Heat', 'Electricity', 'Magnetism', 'Chemical Changes', 'Acids & Bases'] },
        { name: 'Biological Science', topics: ['Nutrition', 'Respiration', 'Transport in Plants & Animals', 'Reproduction', 'Ecosystem'] },
        { name: 'Social Studies', topics: ['Medieval India', 'Mughal Empire', 'Andhra Pradesh History', 'Climate', 'Agriculture'] },
      ],
    },
    {
      grade: '8',
      subjects: [
        { name: 'Telugu', topics: ['సాహిత్యం', 'వ్యాకరణం', 'రచన', 'వాచకం'] },
        { name: 'English', topics: ['Literature', 'Grammar', 'Composition', 'Media Studies', 'Communication'] },
        { name: 'Hindi', topics: ['साहित्य', 'व्याकरण', 'रचना', 'संचार'] },
        { name: 'Mathematics', topics: ['Rational Numbers', 'Powers & Exponents', 'Factorization', 'Linear Equations', 'Data Handling', 'Mensuration'] },
        { name: 'Physical Science', topics: ['Matter – Properties', 'Metals & Non-metals', 'Force & Pressure', 'Friction', 'Sound', 'Light', 'Pollution'] },
        { name: 'Biological Science', topics: ['Cell – Structure', 'Crop Production', 'Conservation', 'Reaching Age of Adolescence', 'Food Production'] },
        { name: 'Social Studies', topics: ['British Rule', 'Freedom Movement', 'Andhra Pradesh', 'Natural Resources', 'Constitution', 'Parliament'] },
      ],
    },
    {
      grade: '9',
      subjects: [
        { name: 'Telugu', topics: ['గద్యం', 'పద్యం', 'వ్యాకరణం', 'రచన – నిబంధన/లేఖ'] },
        { name: 'English', topics: ['Reading', 'Writing', 'Grammar', 'Literature', 'Project Work'] },
        { name: 'Hindi', topics: ['गद्य', 'पद्य', 'व्याकरण', 'लेखन', 'परियोजना'] },
        { name: 'Mathematics', topics: ['Real Numbers', 'Polynomials', 'Linear Equations in 2 Variables', 'Quadrilaterals', 'Statistics', 'Probability', 'Coordinate Geometry'] },
        { name: 'Physical Science', topics: ['Motion', 'Laws of Motion', 'Is Matter Pure', 'Atoms & Molecules', 'Structure of Atom', 'Gravitation', 'Floating Bodies'] },
        { name: 'Biological Science', topics: ['Cell – Basic Unit', 'Diversity in Living Organisms', 'Health & Disease', 'Tissues', 'Improvement in Food Resources'] },
        { name: 'Social Studies', topics: ['French Revolution', 'Socialism', 'Nationalism', 'Physical Features of India', 'Climate', 'Poverty', 'Democracy', 'Electoral Process'] },
        { name: 'Computer Science', topics: ['HTML', 'Internet Safety', 'Python Introduction', 'Problem Solving'] },
      ],
    },
    {
      grade: '10',
      subjects: [
        { name: 'Telugu', topics: ['గద్యం', 'పద్యం', 'ఆంధ్రప్రదేశ్ సాహిత్యం', 'వ్యాకరణం', 'రచన'] },
        { name: 'English', topics: ['Reading', 'Writing', 'Grammar', 'Literature Analysis', 'Communication Skills'] },
        { name: 'Hindi', topics: ['गद्य', 'पद्य', 'व्याकरण', 'लेखन – पत्र/निबंध', 'साहित्य'] },
        { name: 'Mathematics', topics: ['Real Numbers', 'Sets', 'Polynomials', 'Pair of Linear Equations', 'Quadratic Equations', 'Progressions', 'Trigonometry', 'Coordinate Geometry', 'Geometry', 'Mensuration', 'Statistics', 'Probability'] },
        { name: 'Physical Science', topics: ['Chemical Reactions', 'Acids Bases Salts', 'Metals & Non-metals', 'Carbon Compounds', 'Periodic Table', 'Reflection & Refraction', 'Human Eye', 'Electricity', 'Magnetism'] },
        { name: 'Biological Science', topics: ['Nutrition', 'Respiration', 'Transportation', 'Excretion', 'Control & Coordination', 'Reproduction', 'Heredity & Evolution', 'Environment & Ecosystem'] },
        { name: 'Social Studies', topics: ['Indian National Movement', 'Independent India', 'Post-War World', 'Andhra Pradesh', 'India – Physical', 'Agriculture', 'Industry', 'Indian Constitution', 'Development', 'Consumer Protection'] },
        { name: 'Computer Science', topics: ['HTML & CSS', 'Python – OOP', 'Database – SQL', 'Networking', 'Cyber Safety', 'ICT in Society'] },
      ],
    },
  ],
}

export const CURRICULUM_NAMES: Record<string, string> = {
  CBSE: 'CBSE (Central Board of Secondary Education)',
  APSSC: 'APSSC (Andhra Pradesh State Syllabus)',
}

export function getSubjectsForGrade(curriculumType: string, grade: string): SubjectSyllabus[] {
  const curriculum = CURRICULA[curriculumType]
  if (!curriculum) return []
  const gradeData = curriculum.find(g => g.grade === grade)
  return gradeData?.subjects || []
}
