import React, { useState, useEffect, useRef } from 'react';
import { 
  User as UserIcon, 
  Calendar as CalendarIcon, 
  Table as TableIcon, 
  Camera as CameraIcon, 
  LogOut, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Download, 
  Plus, 
  ArrowRight, 
  Clock,
  UserPlus,
  Shield,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { 
  auth, 
  db, 
  googleProvider, 
  OperationType, 
  handleFirestoreError,
  signInWithEmailAndPassword,
  createSecondaryUser
} from './firebase';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
import { User, AttendanceRecord, GapReason, verifyFace } from './types';

// Components
const Camera = ({ onCapture, registeredFace }: { onCapture: (img: string) => void, registeredFace?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError("Camera access denied"));
  }, []);

  const capture = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 640, 480);
        const img = canvasRef.current.toDataURL('image/jpeg');
        
        if (registeredFace) {
          setIsVerifying(true);
          const isMatch = await verifyFace(registeredFace, img);
          setIsVerifying(false);
          if (isMatch) {
            onCapture(img);
          } else {
            setError("Face verification failed. Please try again.");
          }
        } else {
          onCapture(img);
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 bg-white p-6 rounded-2xl shadow-xl border border-zinc-200">
      <div className="relative w-full max-w-md aspect-video bg-zinc-100 rounded-xl overflow-hidden border-2 border-zinc-300">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <canvas ref={canvasRef} width={640} height={480} className="hidden" />
        {isVerifying && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Verifying Face...</p>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
      <button 
        onClick={capture}
        disabled={isVerifying}
        className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-full hover:bg-zinc-800 transition-all disabled:opacity-50"
      >
        <CameraIcon size={20} />
        Capture & Verify
      </button>
    </div>
  );
};

const Calendar = ({ records, userId }: { records: AttendanceRecord[], userId: string }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const userRecords = records.filter(r => r.userId === userId);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-zinc-900">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-bold text-zinc-400 uppercase tracking-wider py-2">{day}</div>
        ))}
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}
        {days.map(day => {
          const record = userRecords.find(r => isSameDay(parseISO(r.date), day));
          return (
            <div 
              key={day.toISOString()} 
              className={cn(
                "aspect-square rounded-xl border border-zinc-100 p-2 flex flex-col items-center justify-center gap-1 transition-all",
                isToday(day) ? "bg-zinc-50 border-zinc-300" : "hover:bg-zinc-50"
              )}
            >
              <span className={cn("text-sm font-medium", isToday(day) ? "text-zinc-900" : "text-zinc-500")}>{format(day, 'd')}</span>
              {record && (
                <div className="flex gap-1">
                  {record.timeIn && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Timed In" />}
                  {record.timeOut && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Timed Out" />}
                  {record.status === 'missed' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Missed Record" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AdminDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [view, setView] = useState<'employees' | 'attendance' | 'gaps'>('employees');
  const [employees, setEmployees] = useState<User[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [gaps, setGaps] = useState<GapReason[]>([]);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', password: '', faceImage: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)).filter(u => u.role === 'employee'));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubRecords = onSnapshot(collection(db, 'records'), (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'records'));

    const unsubGaps = onSnapshot(collection(db, 'gaps'), (snapshot) => {
      setGaps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GapReason)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'gaps'));

    return () => { unsubUsers(); unsubRecords(); unsubGaps(); };
  }, []);

  const handleCreateEmployee = async () => {
    if (!newEmployee.name || !newEmployee.email || !newEmployee.password || !newEmployee.faceImage) return;
    setCreating(true);
    try {
      // 1. Create user in Firebase Auth using secondary app to avoid signing out admin
      const authUser = await createSecondaryUser(newEmployee.email, newEmployee.password);
      
      // 2. Create user document in Firestore
      await setDoc(doc(db, 'users', authUser.uid), {
        name: newEmployee.name,
        email: newEmployee.email,
        faceImage: newEmployee.faceImage,
        role: 'employee'
      });

      setNewEmployee({ name: '', email: '', password: '', faceImage: '' });
      setShowAddEmployee(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to create employee account');
    } finally {
      setCreating(false);
    }
  };

  const handleExport = () => {
    const data = records.map(r => {
      const emp = employees.find(e => e.id === r.userId);
      return {
        Employee: emp?.name || 'Unknown',
        Date: r.date,
        'Time In': r.timeIn ? format(parseISO(r.timeIn), 'hh:mm a') : '-',
        'Time Out': r.timeOut ? format(parseISO(r.timeOut), 'hh:mm a') : '-',
        Status: r.status
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, "Attendance_Report.xlsx");
  };

  const handleGapAction = async (gapId: string, status: 'approved' | 'denied') => {
    try {
      await updateDoc(doc(db, 'gaps', gapId), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `gaps/${gapId}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white">
            <Shield size={24} />
          </div>
          <h1 className="font-bold text-zinc-900 leading-tight">Attendance<br/>Admin</h1>
        </div>
        
        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setView('employees')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium", view === 'employees' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-500 hover:bg-zinc-100")}
          >
            <UserPlus size={20} />
            Employees
          </button>
          <button 
            onClick={() => setView('attendance')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium", view === 'attendance' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-500 hover:bg-zinc-100")}
          >
            <CalendarIcon size={20} />
            Attendance
          </button>
          <button 
            onClick={() => setView('gaps')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium", view === 'gaps' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-500 hover:bg-zinc-100")}
          >
            <AlertCircle size={20} />
            Gap Requests
          </button>
        </nav>

        <div className="mt-auto">
          <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-medium w-full">
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <header className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900 capitalize">{view}</h2>
              <p className="text-zinc-500">Manage your organization's attendance system</p>
            </div>
            {view === 'employees' && (
              <button 
                onClick={() => setShowAddEmployee(true)}
                className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-full hover:bg-zinc-800 transition-all shadow-lg"
              >
                <Plus size={20} />
                Add Employee
              </button>
            )}
            {view === 'attendance' && (
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full hover:bg-emerald-700 transition-all shadow-lg"
              >
                <Download size={20} />
                Export Excel
              </button>
            )}
          </header>

          <AnimatePresence mode="wait">
            {view === 'employees' && (
              <motion.div 
                key="employees"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {employees.map(emp => (
                  <div key={emp.id} className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-100 border-2 border-zinc-200">
                      {emp.faceImage ? (
                        <img src={emp.faceImage} alt={emp.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                          <UserIcon size={32} />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">{emp.name}</h4>
                      <p className="text-sm text-zinc-500">{emp.email}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {view === 'attendance' && (
              <motion.div 
                key="attendance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-8"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-bottom border-zinc-200">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Time In</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Time Out</th>
                        <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {records.map(r => {
                        const emp = employees.find(e => e.id === r.userId);
                        return (
                          <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-zinc-900">{emp?.name || 'Unknown'}</td>
                            <td className="px-6 py-4 text-zinc-500">{r.date}</td>
                            <td className="px-6 py-4 text-zinc-500">{r.timeIn ? format(parseISO(r.timeIn), 'hh:mm a') : '-'}</td>
                            <td className="px-6 py-4 text-zinc-500">{r.timeOut ? format(parseISO(r.timeOut), 'hh:mm a') : '-'}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                r.status === 'present' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              )}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {view === 'gaps' && (
              <motion.div 
                key="gaps"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 gap-6"
              >
                {gaps.map(gap => {
                  const emp = employees.find(e => e.id === gap.userId);
                  const record = records.find(r => r.id === gap.recordId);
                  return (
                    <div key={gap.id} className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-400">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-900">{emp?.name}</h4>
                          <p className="text-sm text-zinc-500">Record Date: {record?.date}</p>
                          <p className="text-sm text-zinc-600 mt-2 font-medium italic">"{gap.reason}"</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {gap.status === 'pending' ? (
                          <>
                            <button 
                              onClick={() => handleGapAction(gap.id, 'approved')}
                              className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all"
                            >
                              <CheckCircle size={20} />
                            </button>
                            <button 
                              onClick={() => handleGapAction(gap.id, 'denied')}
                              className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                            >
                              <XCircle size={20} />
                            </button>
                          </>
                        ) : (
                          <span className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider",
                            gap.status === 'approved' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {gap.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold text-zinc-900">Add New Employee</h3>
                <button onClick={() => setShowAddEmployee(false)} className="p-2 hover:bg-zinc-100 rounded-full">
                  <XCircle size={24} className="text-zinc-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">Full Name</label>
                  <input 
                    type="text" 
                    value={newEmployee.name}
                    onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" 
                    value={newEmployee.email}
                    onChange={e => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
                  <input 
                    type="password" 
                    value={newEmployee.password}
                    onChange={e => setNewEmployee({ ...newEmployee, password: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">Face Registration</label>
                  {newEmployee.faceImage ? (
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-zinc-200">
                      <img src={newEmployee.faceImage} alt="Face" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setNewEmployee({ ...newEmployee, faceImage: '' })}
                        className="absolute top-4 right-4 p-2 bg-white/90 rounded-full shadow-lg hover:bg-white transition-all"
                      >
                        <XCircle size={20} className="text-red-500" />
                      </button>
                    </div>
                  ) : (
                    <Camera onCapture={img => setNewEmployee({ ...newEmployee, faceImage: img })} />
                  )}
                </div>
              </div>

              <div className="mt-10 flex gap-4">
                <button 
                  onClick={() => setShowAddEmployee(false)}
                  className="flex-1 px-6 py-4 rounded-2xl border border-zinc-200 font-bold text-zinc-500 hover:bg-zinc-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateEmployee}
                  disabled={creating}
                  className="flex-1 px-6 py-4 rounded-2xl bg-zinc-900 text-white font-bold hover:bg-zinc-800 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Create Account
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const EmployeeDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [gaps, setGaps] = useState<GapReason[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'in' | 'out'>('in');
  const [missedRecord, setMissedRecord] = useState<AttendanceRecord | null>(null);
  const [gapReason, setGapReason] = useState('');
  const [view, setView] = useState<'calendar' | 'table'>('calendar');

  useEffect(() => {
    const unsubRecords = onSnapshot(query(collection(db, 'records'), where('userId', '==', user.id)), (snapshot) => {
      const userRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setRecords(userRecords);

      // Check for missed time out from yesterday or before
      const today = format(new Date(), 'yyyy-MM-dd');
      const missed = userRecords.find(rec => rec.date !== today && rec.timeIn && !rec.timeOut && rec.status !== 'missed');
      if (missed) {
        setMissedRecord(missed);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'records'));

    const unsubGaps = onSnapshot(query(collection(db, 'gaps'), where('userId', '==', user.id)), (snapshot) => {
      setGaps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GapReason)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'gaps'));

    return () => { unsubRecords(); unsubGaps(); };
  }, [user.id]);

  const handleTimeAction = async (img: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const existingRecord = records.find(r => r.date === today);

    try {
      if (cameraMode === 'in') {
        if (!existingRecord) {
          await addDoc(collection(db, 'records'), {
            userId: user.id,
            date: today,
            timeIn: new Date().toISOString(),
            status: 'present'
          });
        }
      } else {
        if (existingRecord && !existingRecord.timeOut) {
          await updateDoc(doc(db, 'records', existingRecord.id), {
            timeOut: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'records');
    }
    setShowCamera(false);
  };

  const handleSubmitGap = async () => {
    if (!missedRecord || !gapReason) return;
    try {
      await addDoc(collection(db, 'gaps'), {
        userId: user.id,
        recordId: missedRecord.id,
        reason: gapReason,
        status: 'pending'
      });
      await updateDoc(doc(db, 'records', missedRecord.id), { status: 'missed' });
      setMissedRecord(null);
      setGapReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'gaps');
    }
  };

  const todayRecord = records.find(r => r.date === format(new Date(), 'yyyy-MM-dd'));

  return (
    <div className="min-h-screen bg-zinc-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-xl">
              <UserIcon size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-zinc-900">Welcome, {user.name}</h1>
              <p className="text-zinc-500 font-medium">Employee Dashboard</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => { setCameraMode('in'); setShowCamera(true); }}
              disabled={!!todayRecord?.timeIn}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 font-bold"
            >
              <Clock size={20} />
              Time In
            </button>
            <button 
              onClick={() => { setCameraMode('out'); setShowCamera(true); }}
              disabled={!todayRecord?.timeIn || !!todayRecord?.timeOut}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 font-bold"
            >
              <LogOut size={20} />
              Time Out
            </button>
            <button onClick={onLogout} className="p-4 bg-white border border-zinc-200 text-zinc-500 rounded-2xl hover:bg-zinc-50 transition-all shadow-sm">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stats */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6">Today's Status</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <Clock size={20} />
                    </div>
                    <span className="font-medium text-zinc-600">Time In</span>
                  </div>
                  <span className="font-bold text-zinc-900">{todayRecord?.timeIn ? format(parseISO(todayRecord.timeIn), 'hh:mm a') : '--:--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <LogOut size={20} />
                    </div>
                    <span className="font-medium text-zinc-600">Time Out</span>
                  </div>
                  <span className="font-bold text-zinc-900">{todayRecord?.timeOut ? format(parseISO(todayRecord.timeOut), 'hh:mm a') : '--:--'}</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 p-8 rounded-3xl shadow-xl text-white">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Attendance Summary</h3>
              <div className="text-4xl font-bold mb-2">{records.length}</div>
              <p className="text-zinc-400 text-sm">Total days recorded this month</p>
            </div>
          </div>

          {/* Main Views */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-zinc-200 w-fit">
              <button 
                onClick={() => setView('calendar')}
                className={cn("flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-sm", view === 'calendar' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-500 hover:bg-zinc-50")}
              >
                <CalendarIcon size={18} />
                Calendar
              </button>
              <button 
                onClick={() => setView('table')}
                className={cn("flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-sm", view === 'table' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-500 hover:bg-zinc-50")}
              >
                <TableIcon size={18} />
                Table
              </button>
            </div>

            <AnimatePresence mode="wait">
              {view === 'calendar' ? (
                <motion.div key="calendar" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <Calendar records={records} userId={user.id} />
                </motion.div>
              ) : (
                <motion.div key="table" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-50 border-bottom border-zinc-200">
                        <tr>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Time In</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Time Out</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {records.map(r => (
                          <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-zinc-900">{r.date}</td>
                            <td className="px-6 py-4 text-zinc-500">{r.timeIn ? format(parseISO(r.timeIn), 'hh:mm a') : '-'}</td>
                            <td className="px-6 py-4 text-zinc-500">{r.timeOut ? format(parseISO(r.timeOut), 'hh:mm a') : '-'}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                r.status === 'present' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              )}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Missed Record Notification */}
      {missedRecord && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8"
          >
            <div className="flex flex-col items-center text-center gap-6">
              <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center">
                <AlertCircle size={48} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-zinc-900">Missed Time Out</h3>
                <p className="text-zinc-500 mt-2">You missed timing out on <strong>{missedRecord.date}</strong>. Please provide a reason for this gap.</p>
              </div>
              <textarea 
                value={gapReason}
                onChange={e => setGapReason(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all min-h-[120px]"
                placeholder="Explain the reason for the missing record..."
              />
              <button 
                onClick={handleSubmitGap}
                disabled={!gapReason}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg disabled:opacity-50"
              >
                Submit Reason
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-zinc-900">Face Verification - Time {cameraMode === 'in' ? 'In' : 'Out'}</h3>
              <button onClick={() => setShowCamera(false)} className="p-2 hover:bg-zinc-100 rounded-full">
                <XCircle size={24} className="text-zinc-400" />
              </button>
            </div>
            <Camera onCapture={handleTimeAction} registeredFace={user.faceImage} />
          </motion.div>
        </div>
      )}
    </div>
  );
};

const Login = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginMode, setLoginMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userEmail = result.user.email;
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (userDoc.exists()) {
        const userData = { id: userDoc.id, ...userDoc.data() } as User;
        onLogin(userData);
      } else if (userEmail === 'isaiahnoelsalazar474@gmail.com') {
        // Bootstrap admin
        const adminData = {
          name: result.user.displayName || 'Admin',
          email: userEmail || '',
          role: 'admin' as const
        };
        await setDoc(doc(db, 'users', result.user.uid), adminData);
        onLogin({ id: result.user.uid, ...adminData });
      } else {
        setError('Access denied. Please contact your administrator to register your account.');
        await signOut(auth);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to sign in with Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const userEmail = result.user.email;
      
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (userDoc.exists()) {
        const userData = { id: userDoc.id, ...userDoc.data() } as User;
        onLogin(userData);
      } else if (userEmail === 'isaiahnoelsalazar474@gmail.com') {
        // Bootstrap admin via email if they registered it
        const adminData = {
          name: 'Admin',
          email: userEmail || '',
          role: 'admin' as const
        };
        await setDoc(doc(db, 'users', result.user.uid), adminData);
        onLogin({ id: result.user.uid, ...adminData });
      } else {
        setError('Access denied. Please contact your administrator.');
        await signOut(auth);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError('Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full border border-zinc-200"
      >
        <div className="flex flex-col items-center text-center gap-6 mb-10">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center text-white shadow-2xl">
            <Clock size={48} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Attendance System</h1>
            <p className="text-zinc-500 mt-2">Sign in to your account</p>
          </div>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-3">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="flex bg-zinc-100 p-1 rounded-2xl">
            <button 
              onClick={() => setLoginMode('google')}
              className={cn("flex-1 py-2 rounded-xl text-sm font-bold transition-all", loginMode === 'google' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
            >
              Google
            </button>
            <button 
              onClick={() => setLoginMode('email')}
              className={cn("flex-1 py-2 rounded-xl text-sm font-bold transition-all", loginMode === 'email' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
            >
              Email
            </button>
          </div>

          {loginMode === 'google' ? (
            <button 
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogIn size={20} />
              )}
              Sign in with Google
            </button>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                  placeholder="name@company.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogIn size={20} />
                )}
                Sign in with Email
              </button>
            </form>
          )}
        </div>

        <div className="mt-10 pt-10 border-t border-zinc-100 text-center">
          <p className="text-xs text-zinc-400">Secure access powered by Firebase</p>
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ id: userDoc.id, ...userDoc.data() } as User);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  return user.role === 'admin' ? (
    <AdminDashboard user={user} onLogout={handleLogout} />
  ) : (
    <EmployeeDashboard user={user} onLogout={handleLogout} />
  );
}
