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

// ─── Detailed syllabi (chapter + topic level) ────────────────────────────────

export type DetailedTopic   = { name: string; order: number }
export type DetailedChapter = { name: string; order: number; topics: DetailedTopic[] }
export type DetailedSubject = { name: string; chapters: DetailedChapter[] }
export type DetailedGradeSyllabus = { board: string; grade: string; subjects: DetailedSubject[] }

export const DETAILED_SYLLABI: DetailedGradeSyllabus[] = [
  {
    board: 'APSSC',
    grade: '10',
    subjects: [
      {
        name: 'Mathematics',
        chapters: [
          {
            name: 'Real Numbers', order: 1,
            topics: [
              { name: "Euclid's Division Lemma", order: 1 },
              { name: 'Fundamental Theorem of Arithmetic', order: 2 },
              { name: 'Revisiting Irrational Numbers', order: 3 },
              { name: 'Revisiting Rational Numbers and Their Decimal Expansions', order: 4 },
            ],
          },
          {
            name: 'Sets', order: 2,
            topics: [
              { name: 'Introduction to Sets', order: 1 },
              { name: 'Types of Sets', order: 2 },
              { name: 'Set Operations – Union, Intersection, Difference', order: 3 },
              { name: 'Venn Diagrams', order: 4 },
              { name: 'Properties of Set Operations', order: 5 },
            ],
          },
          {
            name: 'Polynomials', order: 3,
            topics: [
              { name: 'Zeroes of a Polynomial', order: 1 },
              { name: 'Relationship Between Zeroes and Coefficients', order: 2 },
              { name: 'Division Algorithm for Polynomials', order: 3 },
            ],
          },
          {
            name: 'Pair of Linear Equations in Two Variables', order: 4,
            topics: [
              { name: 'Graphical Method of Solution', order: 1 },
              { name: 'Algebraic Methods – Substitution', order: 2 },
              { name: 'Algebraic Methods – Elimination', order: 3 },
              { name: 'Cross-Multiplication Method', order: 4 },
              { name: 'Equations Reducible to Pair of Linear Equations', order: 5 },
            ],
          },
          {
            name: 'Quadratic Equations', order: 5,
            topics: [
              { name: 'Standard Form of a Quadratic Equation', order: 1 },
              { name: 'Solution by Factorisation', order: 2 },
              { name: 'Completing the Square', order: 3 },
              { name: 'Quadratic Formula', order: 4 },
              { name: 'Nature of Roots – Discriminant', order: 5 },
              { name: 'Word Problems', order: 6 },
            ],
          },
          {
            name: 'Progressions', order: 6,
            topics: [
              { name: 'Arithmetic Progressions – nth Term', order: 1 },
              { name: 'Sum of First n Terms of AP', order: 2 },
              { name: 'Geometric Progressions – nth Term', order: 3 },
              { name: 'Sum of n Terms of GP', order: 4 },
              { name: 'Sum of Infinite GP', order: 5 },
            ],
          },
          {
            name: 'Coordinate Geometry', order: 7,
            topics: [
              { name: 'Distance Formula', order: 1 },
              { name: 'Section Formula', order: 2 },
              { name: 'Area of a Triangle', order: 3 },
              { name: 'Collinearity of Points', order: 4 },
            ],
          },
          {
            name: 'Similar Triangles', order: 8,
            topics: [
              { name: "Basic Proportionality Theorem (Thales')", order: 1 },
              { name: 'Criteria for Similarity of Triangles', order: 2 },
              { name: 'Areas of Similar Triangles', order: 3 },
              { name: "Pythagoras Theorem", order: 4 },
            ],
          },
          {
            name: 'Tangents and Secants to a Circle', order: 9,
            topics: [
              { name: 'Tangent to a Circle', order: 1 },
              { name: 'Number of Tangents from an External Point', order: 2 },
              { name: 'Segment of a Circle', order: 3 },
              { name: 'Areas of Sectors and Segments', order: 4 },
            ],
          },
          {
            name: 'Mensuration', order: 10,
            topics: [
              { name: 'Surface Area – Combination of Solids', order: 1 },
              { name: 'Volume – Combination of Solids', order: 2 },
              { name: 'Conversion of Solid from One Shape to Another', order: 3 },
              { name: 'Frustum of a Cone', order: 4 },
            ],
          },
          {
            name: 'Trigonometry', order: 11,
            topics: [
              { name: 'Trigonometric Ratios', order: 1 },
              { name: 'Trigonometric Ratios of Specific Angles', order: 2 },
              { name: 'Trigonometric Ratios of Complementary Angles', order: 3 },
              { name: 'Trigonometric Identities', order: 4 },
            ],
          },
          {
            name: 'Applications of Trigonometry', order: 12,
            topics: [
              { name: 'Heights and Distances – Angle of Elevation', order: 1 },
              { name: 'Heights and Distances – Angle of Depression', order: 2 },
              { name: 'Problems with Two Observations', order: 3 },
            ],
          },
          {
            name: 'Probability', order: 13,
            topics: [
              { name: 'Classical Definition of Probability', order: 1 },
              { name: 'Impossible and Sure Events', order: 2 },
              { name: 'Problems on Single Events', order: 3 },
              { name: 'Problems on Combined Events', order: 4 },
            ],
          },
          {
            name: 'Statistics', order: 14,
            topics: [
              { name: 'Mean of Grouped Data', order: 1 },
              { name: 'Mode of Grouped Data', order: 2 },
              { name: 'Median of Grouped Data', order: 3 },
              { name: 'Ogives – Less Than and Greater Than', order: 4 },
            ],
          },
        ],
      },
      {
        name: 'Physical Science',
        chapters: [
          {
            name: 'Heat', order: 1,
            topics: [
              { name: 'Thermal Expansion of Solids, Liquids, Gases', order: 1 },
              { name: 'Specific Heat Capacity and Calorimetry', order: 2 },
              { name: 'Changes of State – Latent Heat', order: 3 },
              { name: 'Evaporation and Humidity', order: 4 },
            ],
          },
          {
            name: 'Acids, Bases and Salts', order: 2,
            topics: [
              { name: 'Acids and Bases – Indicators', order: 1 },
              { name: 'pH Scale', order: 2 },
              { name: 'Neutralisation', order: 3 },
              { name: 'Important Chemical Compounds', order: 4 },
            ],
          },
          {
            name: 'Chemical Reactions and Equations', order: 3,
            topics: [
              { name: 'Chemical Equations and Balancing', order: 1 },
              { name: 'Types of Chemical Reactions', order: 2 },
              { name: 'Oxidation and Reduction', order: 3 },
              { name: 'Corrosion and Rancidity', order: 4 },
            ],
          },
          {
            name: 'Reflection of Light at Curved Surfaces', order: 4,
            topics: [
              { name: 'Reflection – Laws and Types of Mirrors', order: 1 },
              { name: 'Image Formation by Concave Mirror', order: 2 },
              { name: 'Image Formation by Convex Mirror', order: 3 },
              { name: 'Mirror Formula and Magnification', order: 4 },
            ],
          },
          {
            name: 'Refraction of Light at Plane Surfaces', order: 5,
            topics: [
              { name: "Refraction and Snell's Law", order: 1 },
              { name: 'Refractive Index', order: 2 },
              { name: 'Critical Angle and Total Internal Reflection', order: 3 },
              { name: 'Applications of Total Internal Reflection', order: 4 },
            ],
          },
          {
            name: 'Refraction of Light at Curved Surfaces', order: 6,
            topics: [
              { name: 'Image Formation by Convex Lens', order: 1 },
              { name: 'Image Formation by Concave Lens', order: 2 },
              { name: 'Lens Formula and Magnification', order: 3 },
              { name: 'Power of a Lens', order: 4 },
            ],
          },
          {
            name: 'Human Eye and Colourful World', order: 7,
            topics: [
              { name: 'Structure of Human Eye', order: 1 },
              { name: 'Defects of Vision and Correction', order: 2 },
              { name: 'Dispersion of Light Through Prism', order: 3 },
              { name: 'Scattering of Light – Tyndall Effect', order: 4 },
            ],
          },
          {
            name: 'Structure of Atom', order: 8,
            topics: [
              { name: 'Atomic Models – Thomson and Rutherford', order: 1 },
              { name: "Bohr's Model of Hydrogen Atom", order: 2 },
              { name: 'Electron Configuration', order: 3 },
              { name: 'Atomic Number, Mass Number, Isotopes', order: 4 },
            ],
          },
          {
            name: 'Classification of Elements – Periodic Table', order: 9,
            topics: [
              { name: "Mendeleev's Periodic Table and Limitations", order: 1 },
              { name: 'Modern Periodic Law and Table', order: 2 },
              { name: 'Trends in the Periodic Table', order: 3 },
              { name: 'Periodic Properties – Atomic Size, Ionisation Energy', order: 4 },
            ],
          },
          {
            name: 'Chemical Bonding', order: 10,
            topics: [
              { name: 'Ionic Bond Formation', order: 1 },
              { name: 'Covalent Bond Formation', order: 2 },
              { name: 'Lewis Structures and Octet Rule', order: 3 },
              { name: 'VSEPR Theory – Molecular Geometry', order: 4 },
              { name: 'Hybridisation', order: 5 },
            ],
          },
          {
            name: 'Electric Current', order: 11,
            topics: [
              { name: "Ohm's Law and Resistance", order: 1 },
              { name: 'Series and Parallel Combination of Resistors', order: 2 },
              { name: 'Heating Effect of Electric Current', order: 3 },
              { name: 'Electric Power and Energy', order: 4 },
              { name: 'Commercial Unit of Electrical Energy', order: 5 },
            ],
          },
          {
            name: 'Electromagnetism', order: 12,
            topics: [
              { name: 'Magnetic Field and Field Lines', order: 1 },
              { name: 'Force on a Current-Carrying Conductor', order: 2 },
              { name: 'Electromagnetic Induction – Faraday', order: 3 },
              { name: 'AC Generator and DC Motor', order: 4 },
              { name: 'Domestic Electric Circuits', order: 5 },
            ],
          },
          {
            name: 'Principles of Metallurgy', order: 13,
            topics: [
              { name: 'Occurrence of Metals and Minerals', order: 1 },
              { name: 'Extraction of Metals – Low, Medium, High Reactivity', order: 2 },
              { name: 'Refining of Metals', order: 3 },
              { name: 'Alloys and Their Importance', order: 4 },
              { name: 'Corrosion – Prevention Methods', order: 5 },
            ],
          },
          {
            name: 'Carbon and Its Compounds', order: 14,
            topics: [
              { name: 'Covalent Bonds in Carbon Compounds', order: 1 },
              { name: 'Versatile Nature of Carbon – Chains and Rings', order: 2 },
              { name: 'Hydrocarbons – Alkanes, Alkenes, Alkynes', order: 3 },
              { name: 'Functional Groups in Organic Compounds', order: 4 },
              { name: 'Ethanol and Ethanoic Acid – Properties', order: 5 },
              { name: 'Soaps and Detergents', order: 6 },
            ],
          },
        ],
      },
      {
        name: 'Biological Science',
        chapters: [
          {
            name: 'Nutrition', order: 1,
            topics: [
              { name: 'Autotrophic Nutrition – Photosynthesis', order: 1 },
              { name: 'Raw Materials and Conditions for Photosynthesis', order: 2 },
              { name: 'Heterotrophic Nutrition', order: 3 },
              { name: 'Human Digestive System', order: 4 },
              { name: 'Digestion and Absorption', order: 5 },
            ],
          },
          {
            name: 'Respiration', order: 2,
            topics: [
              { name: 'Aerobic Respiration', order: 1 },
              { name: 'Anaerobic Respiration', order: 2 },
              { name: 'Human Respiratory System', order: 3 },
              { name: 'Exchange of Gases', order: 4 },
            ],
          },
          {
            name: 'Transportation', order: 3,
            topics: [
              { name: 'Transport in Plants – Xylem and Phloem', order: 1 },
              { name: 'Transpiration', order: 2 },
              { name: 'Blood and Its Components', order: 3 },
              { name: 'Human Heart – Structure and Function', order: 4 },
              { name: 'Blood Vessels and Circulation', order: 5 },
              { name: 'Lymph', order: 6 },
            ],
          },
          {
            name: 'Excretion', order: 4,
            topics: [
              { name: 'Excretion in Plants', order: 1 },
              { name: 'Human Excretory System', order: 2 },
              { name: 'Structure and Function of Kidney', order: 3 },
              { name: 'Urine Formation', order: 4 },
              { name: 'Dialysis', order: 5 },
            ],
          },
          {
            name: 'Control and Coordination', order: 5,
            topics: [
              { name: 'Nervous System – Neurons and Nerve Impulse', order: 1 },
              { name: 'Human Brain – Parts and Functions', order: 2 },
              { name: 'Reflex Action and Reflex Arc', order: 3 },
              { name: 'Endocrine Glands and Hormones', order: 4 },
              { name: 'Coordination between Nervous and Endocrine Systems', order: 5 },
            ],
          },
          {
            name: 'Reproduction', order: 6,
            topics: [
              { name: 'Asexual Reproduction – Fission, Budding, Fragmentation', order: 1 },
              { name: 'Vegetative Propagation in Plants', order: 2 },
              { name: 'Sexual Reproduction in Flowering Plants', order: 3 },
              { name: 'Pollination and Fertilisation', order: 4 },
              { name: 'Human Reproductive System – Male', order: 5 },
              { name: 'Human Reproductive System – Female', order: 6 },
              { name: 'Reproductive Health', order: 7 },
            ],
          },
          {
            name: 'Coordination in Life Processes', order: 7,
            topics: [
              { name: 'Interaction between Different Systems', order: 1 },
              { name: 'Homeostasis', order: 2 },
            ],
          },
          {
            name: 'Heredity', order: 8,
            topics: [
              { name: "Mendel's Laws of Inheritance", order: 1 },
              { name: 'Monohybrid Cross', order: 2 },
              { name: 'Dihybrid Cross', order: 3 },
              { name: 'Sex Determination', order: 4 },
              { name: 'Variation and Its Sources', order: 5 },
            ],
          },
          {
            name: 'Our Environment', order: 9,
            topics: [
              { name: 'Ecosystem – Components and Structure', order: 1 },
              { name: 'Food Chains and Food Webs', order: 2 },
              { name: 'Energy Flow in Ecosystem', order: 3 },
              { name: 'Biodegradable and Non-biodegradable Waste', order: 4 },
              { name: 'Conservation of Biodiversity', order: 5 },
            ],
          },
          {
            name: 'Natural Resources', order: 10,
            topics: [
              { name: 'Air – Composition and Pollution', order: 1 },
              { name: 'Water – Pollution and Conservation', order: 2 },
              { name: 'Soil – Formation and Pollution', order: 3 },
              { name: 'Fossil Fuels – Consequences of Overuse', order: 4 },
              { name: 'Sustainable Management of Natural Resources', order: 5 },
            ],
          },
        ],
      },
      {
        name: 'Social Studies',
        chapters: [
          {
            name: 'The Nationalist Movement in India (1885–1947)', order: 1,
            topics: [
              { name: 'Indian National Congress – Formation and Early Phase', order: 1 },
              { name: 'Partition of Bengal and Swadeshi Movement', order: 2 },
              { name: 'Gandhian Era – Non-Cooperation Movement', order: 3 },
              { name: 'Civil Disobedience Movement', order: 4 },
              { name: 'Quit India Movement', order: 5 },
              { name: 'Indian Independence and Partition', order: 6 },
            ],
          },
          {
            name: 'The World Between Two World Wars', order: 2,
            topics: [
              { name: 'Causes and Consequences of World War I', order: 1 },
              { name: 'Russian Revolution and Rise of Communism', order: 2 },
              { name: 'Rise of Fascism and Nazism', order: 3 },
              { name: 'World War II – Causes and Course', order: 4 },
              { name: 'Consequences of World War II', order: 5 },
            ],
          },
          {
            name: 'National Liberation Movements in the Colonies', order: 3,
            topics: [
              { name: 'Decolonisation in Asia', order: 1 },
              { name: 'African Independence Movements', order: 2 },
              { name: 'Latin American Movements', order: 3 },
            ],
          },
          {
            name: 'Formation of States after World War II', order: 4,
            topics: [
              { name: 'United Nations – Formation and Structure', order: 1 },
              { name: 'Cold War – USA and USSR', order: 2 },
              { name: 'Decolonisation and New Nations', order: 3 },
            ],
          },
          {
            name: 'Post War World and India', order: 5,
            topics: [
              { name: 'Nehru Era – Foreign Policy and Non-Alignment', order: 1 },
              { name: 'Five-Year Plans and Economic Development', order: 2 },
              { name: 'Democracy and Social Transformation', order: 3 },
            ],
          },
          {
            name: 'Land, Water, Natural Vegetation and Wildlife', order: 6,
            topics: [
              { name: 'Land Resources of India', order: 1 },
              { name: 'Water Resources – Rivers and Dams', order: 2 },
              { name: 'Natural Vegetation – Types and Distribution', order: 3 },
              { name: 'Wildlife – Conservation and Biodiversity', order: 4 },
            ],
          },
          {
            name: 'India – Agriculture', order: 7,
            topics: [
              { name: 'Types of Farming', order: 1 },
              { name: 'Major Crops – Food and Commercial', order: 2 },
              { name: 'Irrigation – Methods and Sources', order: 3 },
              { name: 'Green Revolution and Agricultural Development', order: 4 },
              { name: 'Problems of Indian Agriculture', order: 5 },
            ],
          },
          {
            name: 'India – Industries', order: 8,
            topics: [
              { name: 'Types of Industries', order: 1 },
              { name: 'Cotton Textile Industry', order: 2 },
              { name: 'Iron and Steel Industry', order: 3 },
              { name: 'Chemical and Petrochemical Industries', order: 4 },
              { name: 'Information Technology Industry', order: 5 },
            ],
          },
          {
            name: 'People and Settlement', order: 9,
            topics: [
              { name: 'Population Distribution and Density', order: 1 },
              { name: 'Population Growth and Migration', order: 2 },
              { name: 'Rural and Urban Settlements', order: 3 },
              { name: 'Urbanisation and Related Issues', order: 4 },
            ],
          },
          {
            name: 'Development', order: 10,
            topics: [
              { name: 'Meaning of Development', order: 1 },
              { name: 'Human Development Index (HDI)', order: 2 },
              { name: 'Sustainable Development', order: 3 },
            ],
          },
          {
            name: 'Sectors of Economy', order: 11,
            topics: [
              { name: 'Primary Sector – Agriculture and Mining', order: 1 },
              { name: 'Secondary Sector – Manufacturing', order: 2 },
              { name: 'Tertiary Sector – Services', order: 3 },
              { name: 'Organised and Unorganised Sectors', order: 4 },
            ],
          },
          {
            name: 'Indian Constitution', order: 12,
            topics: [
              { name: 'Preamble and Its Significance', order: 1 },
              { name: 'Fundamental Rights', order: 2 },
              { name: 'Directive Principles of State Policy', order: 3 },
              { name: 'Fundamental Duties', order: 4 },
              { name: 'Constitutional Amendments', order: 5 },
            ],
          },
          {
            name: 'Indian Government', order: 13,
            topics: [
              { name: 'Parliament – Lok Sabha and Rajya Sabha', order: 1 },
              { name: 'Executive – President, PM and Council of Ministers', order: 2 },
              { name: 'Judiciary – Supreme Court and High Courts', order: 3 },
              { name: 'Federalism – Centre-State Relations', order: 4 },
            ],
          },
          {
            name: 'India and its Neighbors', order: 14,
            topics: [
              { name: 'India-China Relations', order: 1 },
              { name: 'India-Pakistan Relations', order: 2 },
              { name: 'SAARC and Regional Cooperation', order: 3 },
            ],
          },
          {
            name: 'Disasters and Disaster Management', order: 15,
            topics: [
              { name: 'Types of Natural Disasters', order: 1 },
              { name: 'Earthquake and Tsunami', order: 2 },
              { name: 'Cyclone and Flood', order: 3 },
              { name: 'Disaster Risk Reduction', order: 4 },
              { name: 'Community-Based Disaster Preparedness', order: 5 },
            ],
          },
        ],
      },
      {
        name: 'Telugu',
        chapters: [
          {
            name: 'గద్యభాగం – 1 (Prose Lesson 1)', order: 1,
            topics: [
              { name: 'పాఠ్యభాగ పరిచయం (Introduction)', order: 1 },
              { name: 'కఠిన పదాలు – అర్థాలు (Vocabulary)', order: 2 },
              { name: 'అభ్యాసాలు (Comprehension Exercises)', order: 3 },
            ],
          },
          {
            name: 'గద్యభాగం – 2 (Prose Lesson 2)', order: 2,
            topics: [
              { name: 'పాఠ్యభాగ పరిచయం', order: 1 },
              { name: 'కఠిన పదాలు – అర్థాలు', order: 2 },
              { name: 'అభ్యాసాలు', order: 3 },
            ],
          },
          {
            name: 'పద్యభాగం – 1 (Poetry Lesson 1)', order: 3,
            topics: [
              { name: 'కవి పరిచయం (Poet Introduction)', order: 1 },
              { name: 'పద్యాల భావం (Meaning of Verses)', order: 2 },
              { name: 'అలంకారాలు (Literary Devices)', order: 3 },
              { name: 'అభ్యాసాలు', order: 4 },
            ],
          },
          {
            name: 'పద్యభాగం – 2 (Poetry Lesson 2)', order: 4,
            topics: [
              { name: 'కవి పరిచయం', order: 1 },
              { name: 'పద్యాల భావం', order: 2 },
              { name: 'అలంకారాలు', order: 3 },
              { name: 'అభ్యాసాలు', order: 4 },
            ],
          },
          {
            name: 'వ్యాకరణం – సంధులు (Grammar – Sandhi)', order: 5,
            topics: [
              { name: 'అచ్ సంధి', order: 1 },
              { name: 'హల్ సంధి', order: 2 },
              { name: 'ప్రాతాది సంధులు', order: 3 },
            ],
          },
          {
            name: 'వ్యాకరణం – సమాసాలు (Grammar – Compounds)', order: 6,
            topics: [
              { name: 'తత్పురుష సమాసం', order: 1 },
              { name: 'కర్మధారయ సమాసం', order: 2 },
              { name: 'బహువ్రీహి సమాసం', order: 3 },
              { name: 'ద్వంద్వ సమాసం', order: 4 },
            ],
          },
          {
            name: 'రచన – వ్యాసం, లేఖ (Writing – Essay & Letter)', order: 7,
            topics: [
              { name: 'వ్యాసరచన (Essay Writing)', order: 1 },
              { name: 'లేఖారచన – అధికారిక (Formal Letter)', order: 2 },
              { name: 'లేఖారచన – అనధికారిక (Informal Letter)', order: 3 },
              { name: 'సారాంశ రచన (Précis Writing)', order: 4 },
            ],
          },
          {
            name: 'ఆంధ్రప్రదేశ్ సాహిత్యం (AP Literature)', order: 8,
            topics: [
              { name: 'ప్రాచీన తెలుగు సాహిత్యం (Classical Literature)', order: 1 },
              { name: 'ఆధునిక తెలుగు సాహిత్యం (Modern Literature)', order: 2 },
              { name: 'ప్రముఖ తెలుగు కవులు (Famous Telugu Poets)', order: 3 },
            ],
          },
        ],
      },
      {
        name: 'English',
        chapters: [
          {
            name: 'Unit 1 – Reading and Comprehension', order: 1,
            topics: [
              { name: 'Reading Passage – Prose', order: 1 },
              { name: 'Vocabulary in Context', order: 2 },
              { name: 'Comprehension Questions', order: 3 },
            ],
          },
          {
            name: 'Unit 2 – Poetry', order: 2,
            topics: [
              { name: 'Poem – Reading and Understanding', order: 1 },
              { name: 'Poetic Devices', order: 2 },
              { name: 'Appreciation Questions', order: 3 },
            ],
          },
          {
            name: 'Unit 3 – Grammar', order: 3,
            topics: [
              { name: 'Tenses – Review and Practice', order: 1 },
              { name: 'Clauses and Phrases', order: 2 },
              { name: 'Voice – Active and Passive', order: 3 },
              { name: 'Reported Speech', order: 4 },
              { name: 'Modals', order: 5 },
            ],
          },
          {
            name: 'Unit 4 – Writing Skills', order: 4,
            topics: [
              { name: 'Formal Letter Writing', order: 1 },
              { name: 'Essay Writing – Descriptive and Argumentative', order: 2 },
              { name: 'Report Writing', order: 3 },
              { name: 'Précis Writing', order: 4 },
            ],
          },
          {
            name: 'Unit 5 – Vocabulary Development', order: 5,
            topics: [
              { name: 'Synonyms and Antonyms', order: 1 },
              { name: 'Word Formation – Prefixes and Suffixes', order: 2 },
              { name: 'Collocations and Phrasal Verbs', order: 3 },
              { name: 'Idioms and Expressions', order: 4 },
            ],
          },
          {
            name: 'Unit 6 – Literature Analysis', order: 6,
            topics: [
              { name: 'Character Sketch', order: 1 },
              { name: 'Theme and Central Idea', order: 2 },
              { name: 'Critical Appreciation', order: 3 },
            ],
          },
          {
            name: 'Unit 7 – Communication Skills', order: 7,
            topics: [
              { name: 'Oral Communication – Speaking Practice', order: 1 },
              { name: 'Listening Comprehension', order: 2 },
              { name: 'Discussion and Debate', order: 3 },
            ],
          },
        ],
      },
      {
        name: 'Hindi',
        chapters: [
          {
            name: 'पाठ 1 – गद्य (Prose Lesson 1)', order: 1,
            topics: [
              { name: 'पाठ परिचय और सारांश', order: 1 },
              { name: 'कठिन शब्दार्थ', order: 2 },
              { name: 'अभ्यास प्रश्न', order: 3 },
            ],
          },
          {
            name: 'पाठ 2 – गद्य (Prose Lesson 2)', order: 2,
            topics: [
              { name: 'पाठ परिचय और सारांश', order: 1 },
              { name: 'कठिन शब्दार्थ', order: 2 },
              { name: 'अभ्यास प्रश्न', order: 3 },
            ],
          },
          {
            name: 'पाठ 3 – पद्य (Poetry Lesson)', order: 3,
            topics: [
              { name: 'कवि परिचय', order: 1 },
              { name: 'कविता का भावार्थ', order: 2 },
              { name: 'अलंकार और छंद', order: 3 },
              { name: 'अभ्यास प्रश्न', order: 4 },
            ],
          },
          {
            name: 'व्याकरण – 1 (Grammar Part 1)', order: 4,
            topics: [
              { name: 'संधि और समास', order: 1 },
              { name: 'विलोम और पर्यायवाची शब्द', order: 2 },
              { name: 'मुहावरे और लोकोक्तियाँ', order: 3 },
            ],
          },
          {
            name: 'व्याकरण – 2 (Grammar Part 2)', order: 5,
            topics: [
              { name: 'काल – भूत, वर्तमान, भविष्य', order: 1 },
              { name: 'वाच्य – कर्तृवाच्य और कर्मवाच्य', order: 2 },
              { name: 'वाक्य – सरल, संयुक्त, मिश्र', order: 3 },
            ],
          },
          {
            name: 'लेखन (Writing)', order: 6,
            topics: [
              { name: 'पत्र लेखन – औपचारिक और अनौपचारिक', order: 1 },
              { name: 'निबंध लेखन', order: 2 },
              { name: 'सारांश लेखन', order: 3 },
              { name: 'संवाद लेखन', order: 4 },
            ],
          },
          {
            name: 'साहित्य बोध (Literary Appreciation)', order: 7,
            topics: [
              { name: 'हिंदी साहित्य की प्रमुख विधाएँ', order: 1 },
              { name: 'प्रमुख हिंदी लेखक और कवि', order: 2 },
              { name: 'साहित्यिक गद्यांश पर प्रश्न', order: 3 },
            ],
          },
        ],
      },
    ],
  },
]

export function getDetailedSyllabus(board: string, grade: string): DetailedGradeSyllabus | null {
  return DETAILED_SYLLABI.find(s => s.board === board && s.grade === grade) ?? null
}
