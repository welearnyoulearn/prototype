import Link from "next/link";

const roles = [
  {
    title: "Platform Admin",
    description: "Manage all schools and platform settings",
    href: "/platform-admin",
    color: "bg-purple-600 hover:bg-purple-700",
    icon: "🏛️",
  },
  {
    title: "School Admin",
    description: "Manage classes, teachers, and school operations",
    href: "/school-admin",
    color: "bg-blue-600 hover:bg-blue-700",
    icon: "🏫",
  },
  {
    title: "Teacher",
    description: "Manage content, classes, attendance, and doubts",
    href: "/teacher",
    color: "bg-green-600 hover:bg-green-700",
    icon: "👩‍🏫",
  },
  {
    title: "Student",
    description: "View classes, access content, and complete tasks",
    href: "/student",
    color: "bg-orange-500 hover:bg-orange-600",
    icon: "🎓",
  },
  {
    title: "Parent",
    description: "Monitor your child's progress and attendance",
    href: "/parent",
    color: "bg-teal-600 hover:bg-teal-700",
    icon: "👨‍👩‍👧",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            VLearnUlearn
          </h1>
          <p className="text-gray-600 text-lg">
            School Management &amp; Learning Platform
          </p>
          <p className="text-gray-500 mt-1 text-sm">
            Select your role to continue
          </p>
        </div>

        <div className="grid gap-4">
          {roles.map((role) => (
            <Link
              key={role.href}
              href={role.href}
              className={`flex items-center gap-4 p-5 rounded-xl text-white ${role.color} transition-all shadow-md hover:shadow-lg`}
            >
              <span className="text-3xl">{role.icon}</span>
              <div>
                <div className="font-semibold text-lg">{role.title}</div>
                <div className="text-white/80 text-sm">{role.description}</div>
              </div>
              <span className="ml-auto text-white/70 text-xl">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
