import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  Plus, 
  MapPin, 
  Phone, 
  Calendar, 
  Layout, 
  Navigation, 
  CheckCircle2, 
  User as UserIcon,
  LogOut,
  CalendarDays,
  Clock,
  Menu,
  X,
  PlusCircle,
  FileText,
  Pencil,
  RotateCcw,
  Search,
  ChevronDown,
  History,
  LayoutDashboard,
  ClipboardList,
  Printer,
  Trash2,
  Users,
  Download,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Send,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  format, 
  startOfWeek, 
  addDays, 
  startOfMonth, 
  endOfMonth, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  isAfter,
  endOfWeek
} from 'date-fns';
import { auth, db, signInWithGoogle } from './firebase';

interface ServiceLog {
  id: string;
  date: string;
  type: string;
  notes: string;
}

interface DailyRoute {
  id: string;
  date: string;
  startOdometer: number;
  endOdometer?: number;
  currentOdometer: number;
  status: 'active' | 'completed';
  createdBy: string;
  createdAt: any;
}

interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  windowCount: number;
  aglCount: number;
  notes: string;
  appointmentTime: string;
  serviceType?: string;
  assignedTo?: string;
  createdBy: string;
  calendarEventId?: string;
  calendarLink?: string;
  completed?: boolean;
  mileageAttributed?: number;
  serviceLogs?: ServiceLog[];
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dailyRoutes, setDailyRoutes] = useState<DailyRoute[]>([]);
  const [employees, setEmployees] = useState<{id: string, name: string, createdBy: string}[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterView, setFilterView] = useState<'active' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncAttempt, setSyncAttempt] = useState(0);
  
  // Navigation & History State
  const [currentRoute, setCurrentRoute] = useState<'dashboard' | 'history' | 'directory' | 'team' | 'help'>('dashboard');
  const [historySort, setHistorySort] = useState<'dateDesc' | 'dateAsc' | 'nameAsc'>('dateDesc');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyServiceFilter, setHistoryServiceFilter] = useState<string>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');
  
  // Directory State
  const [directorySearchQuery, setDirectorySearchQuery] = useState('');
  
  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Maps Import State
  const [isImporting, setIsImporting] = useState(false);
  const [hasImported, setHasImported] = useState(localStorage.getItem('maps_imported') === 'true');
  
  // Service Log Setup
  const [historyModalCustomerId, setHistoryModalCustomerId] = useState<string | null>(null);
  const [logFormData, setLogFormData] = useState({ date: format(new Date(), 'yyyy-MM-dd'), type: '', notes: '' });
  const activeHistoryCustomer = customers.find(c => c.id === historyModalCustomerId);
  
  // Route Tracking State
  const [showRouteModal, setShowRouteModal] = useState<'start' | 'end' | null>(null);
  const [showJobMileageModal, setShowJobMileageModal] = useState<string | null>(null);
  const [odometerInput, setOdometerInput] = useState('');
  
  // Print Setup
  const [printSelectOpen, setPrintSelectOpen] = useState(false);
  const [printDate, setPrintDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSingleCustomer, setPrintSingleCustomer] = useState<Customer | null>(null);
  
  // Google Calendar Integration State
  const [googleTokens, setGoogleTokens] = useState<any>(() => {
    const saved = localStorage.getItem('google_calendar_tokens');
    return saved ? JSON.parse(saved) : null;
  });

  // Team Management State
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);

  // Offline/Online State
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light' | 'midnight' | 'forest'>(() => {
    return (localStorage.getItem('apex_theme') as 'dark' | 'light' | 'midnight' | 'forest') || 'dark';
  });

  // Calendar Dashboard State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('apex_theme', theme);
  }, [theme]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    windowCount: '' as number | string,
    aglCount: '' as number | string,
    notes: '',
    serviceType: 'Window Cleaning',
    assignedTo: 'Unassigned',
    apptDate: format(new Date(), 'yyyy-MM-dd'),
    apptHour: '',
    apptMinute: '',
    apptAmPm: 'AM' as 'AM' | 'PM',
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    {
      const q = query(
        collection(db, 'customers'),
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
        setCustomers(docs);
      });

      const qRoutes = query(
        collection(db, 'routes'),
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubRoutes = onSnapshot(qRoutes, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DailyRoute));
        setDailyRoutes(docs);
      });

      const qEmployees = query(
        collection(db, 'employees'),
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'asc')
      );

      const unsubEmployees = onSnapshot(qEmployees, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, name: d.data().name, createdBy: d.data().createdBy }));
        setEmployees(docs);
      });

      return () => {
        unsubscribe();
        unsubRoutes();
        unsubEmployees();
      };
    }
  }, [user]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        const tokens = event.data.tokens;
        setGoogleTokens(tokens);
        localStorage.setItem('google_calendar_tokens', JSON.stringify(tokens));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  const sendNotification = (title: string, options?: NotificationOptions) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, options);
    }
  };

  useEffect(() => {
    if (!user || customers.length === 0) return;
    
    // Check for upcoming appointments (1 hour away)
    const interval = setInterval(() => {
       const now = new Date();
       customers.forEach(customer => {
          if (!customer.completed) {
             const apptTime = new Date(customer.appointmentTime);
             const timeDiffMs = apptTime.getTime() - now.getTime();
             const timeDiffMins = timeDiffMs / 1000 / 60;
             
             // Trigger notification if strictly between 59 and 60 minutes away to avoid spamming
             if (timeDiffMins > 0 && timeDiffMins <= 60 && timeDiffMins >= 59.0) {
                 sendNotification(`Upcoming: ${customer.name}`, {
                    body: `Your appointment is starting in 1 hour at ${format(apptTime, 'h:mm a')}\nAddress: ${customer.address}`
                 });
             }
          }
       });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [customers, user]);

  const handleConnectCalendar = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth_popup', 'width=600,height=700');
    } catch (err) {
      console.error('Failed to get auth URL', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      phone: '',
      windowCount: '',
      aglCount: '',
      notes: '',
      serviceType: 'Window Cleaning',
      assignedTo: 'Unassigned',
      apptDate: format(new Date(), 'yyyy-MM-dd'),
      apptHour: '',
      apptMinute: '',
      apptAmPm: 'AM',
    });
    setEditingId(null);
    setFormError(null);
  };

  const handleImportMaps = async () => {
    if (!user) return;
    setIsImporting(true);
    
    const mapsImportData = [
      { name: "Joan Paterson", address: "900 S 6th Dr", phone: "352-262-6743", windowCount: 24, aglCount: 1, notes: "" },
      { name: "Marcia Lautzenheiser", address: "120 S Paloma", phone: "760-553-3954", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Joan Beebe", address: "2080 Ridge Crest Dr", phone: "", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Cheryl Lyczynski", address: "800 W Snow Creek Trail", phone: "480-444-6013", windowCount: 25, aglCount: 0, notes: "Fans" },
      { name: "Steve Thompson", address: "3453 Spur Ln", phone: "928-205-0015", windowCount: 35, aglCount: 5, notes: "" },
      { name: "Mark Brennan", address: "1651 W Snow Creek Loop", phone: "520-301-6207", windowCount: 25, aglCount: 4, notes: "" },
      { name: "Unknown Resident", address: "1751 W Snow Creek Loop", phone: "", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Suzanne Martin", address: "1641 W Snow Creek Trail", phone: "602-214-7475", windowCount: 0, aglCount: 0, notes: "Building" },
      { name: "Kakavis", address: "1091 N 22nd Ave", phone: "", windowCount: 0, aglCount: 0, notes: "Being sold" },
      { name: "Michelle Hooker", address: "3041 W Falling Leaf Rd", phone: "520-488-7791", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Michael Donoghue & Donna Williams", address: "2150 S Trillium Ln", phone: "714-272-9725 / 520-240-1121", windowCount: 19, aglCount: 4, notes: "" },
      { name: "Jamie & Jeff Penny (Wagon Wheel)", address: "1169 West Dr", phone: "928-210-9433", windowCount: 25, aglCount: 5, notes: "fan" },
      { name: "James & Karen Matteson", address: "3424 W Country Club Cir", phone: "928-532-2948", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Sandy Davis & Laurie", address: "6886 Forest Ave", phone: "480-327-9020 / 928-537-5660", windowCount: 30, aglCount: 0, notes: "@ $375" },
      { name: "Brenda & Bill McDade", address: "3441 W Cooley St", phone: "928-228-8734", windowCount: 18, aglCount: 0, notes: "" },
      { name: "Debbie & Steve Eymann", address: "3550 W Sugar Pine Way", phone: "602-980-7898", windowCount: 23, aglCount: 3, notes: "gutters. Torreon Real Estate" },
      { name: "Pamela Lahr", address: "5980 Rim Rd", phone: "520-730-0201", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Mark DeMeo", address: "980 S Falling Leaf Rd", phone: "707-484-0965", windowCount: 35, aglCount: 6, notes: "@ $420 35 outs @ $280" },
      { name: "Beth Mader", address: "1561 N Mustang Cir", phone: "480-205-4401", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Unknown Resident", address: "4705 Mountain Hollow Loop", phone: "", windowCount: 0, aglCount: 0, notes: "" },
      { name: "Jeff Castner", address: "4811 W Eagle Mountain Dr", phone: "916-240-9895", windowCount: 17, aglCount: 0, notes: "fans" },
      { name: "Theresa Renfro", address: "1519 Spruce Ln", phone: "602-320-1291", windowCount: 20, aglCount: 0, notes: "3 French doors" },
      { name: "Sabina Sullivan (c/o Stacy)", address: "9595 Sierra Springs Dr", phone: "928-369-3900 / 928-242-7731", windowCount: 58, aglCount: 8, notes: "Gate code: 3764" },
      { name: "Chapin & Angela Bell (c/o Stacey)", address: "9550 Sierra Springs Ln", phone: "928-242-7731", windowCount: 35, aglCount: 4, notes: "@400" },
      { name: "Keith Gordon WMSH", address: "2394 Cottontail Trail (Lot 254)", phone: "602-339-5854", windowCount: 31, aglCount: 8, notes: "" },
      { name: "Janey Messmore", address: "2209 N Wind Dr", phone: "509-840-0723", windowCount: 9, aglCount: 0, notes: "Gate code #1794" },
      { name: "Janey Messmore", address: "2407 N Wind Dr #1", phone: "509-840-0723", windowCount: 9, aglCount: 0, notes: "" }
    ];

    try {
      await Promise.all(mapsImportData.map(client => 
        addDoc(collection(db, 'customers'), {
          name: client.name,
          address: client.address,
          phone: client.phone,
          windowCount: client.windowCount,
          aglCount: client.aglCount,
          notes: client.notes,
          appointmentTime: new Date().toISOString(),
          createdBy: user.uid,
          completed: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      ));
      
      localStorage.setItem('maps_imported', 'true');
      setHasImported(true);
    } catch (e) {
      console.error("Error importing maps clients:", e);
    }
    
    setIsImporting(false);
  };

  const handleOpenAddForm = () => {
    resetForm();
    setShowAddForm(true);
    setSyncError(null);
  };

  const handleEditClick = (customer: Customer) => {
    const d = new Date(customer.appointmentTime);
    setFormData({
      name: customer.name,
      address: customer.address,
      phone: customer.phone,
      windowCount: customer.windowCount,
      aglCount: customer.aglCount,
      notes: customer.notes,
      serviceType: customer.serviceType || 'Window Cleaning',
      assignedTo: customer.assignedTo || 'Unassigned',
      apptDate: format(d, 'yyyy-MM-dd'),
      apptHour: format(d, 'hh'),
      apptMinute: format(d, 'mm'),
      apptAmPm: Number(format(d, 'H')) >= 12 ? 'PM' : ('AM' as 'AM' | 'PM'),
    });
    setEditingId(customer.id);
    setShowAddForm(true);
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHistoryCustomer) return;
    try {
      const newLog = {
        id: Date.now().toString(),
        date: logFormData.date,
        type: logFormData.type,
        notes: logFormData.notes
      };
      const existingLogs = activeHistoryCustomer.serviceLogs || [];
      await updateDoc(doc(db, 'customers', activeHistoryCustomer.id), {
        serviceLogs: [newLog, ...existingLogs],
        updatedAt: serverTimestamp()
      });
      setLogFormData({ date: format(new Date(), 'yyyy-MM-dd'), type: '', notes: '' });
    } catch (err) {
      console.error('Error adding service log', err);
    }
  };

  const handleToggleComplete = async (customer: Customer) => {
    try {
      await updateDoc(doc(db, 'customers', customer.id), {
        completed: !customer.completed,
        updatedAt: serverTimestamp(),
      });
      // Send push notification on status change
      sendNotification(`Mission ${!customer.completed ? 'Completed' : 'Reactivated'}`, {
        body: `Job for ${customer.name} has been marked as ${!customer.completed ? 'complete' : 'active'}.`
      });
    } catch (err) {
      console.error('Error toggling complete status:', err);
    }
  };

  const handleDeleteClient = async (customerId: string) => {
    try {
      await deleteDoc(doc(db, 'customers', customerId));
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting client:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    // Client-side Validation
    const phoneDigits = formData.phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10) {
      setFormError('Phone number must have at least 10 digits.');
      return;
    }

    if (!formData.apptDate) {
      setFormError('Target Date is required.');
      return;
    }

    const hour = parseInt(formData.apptHour, 10);
    if (isNaN(hour) || hour < 1 || hour > 12) {
      setFormError('Hour must be between 1 and 12.');
      return;
    }

    if (formData.apptMinute) {
      const min = parseInt(formData.apptMinute, 10);
      if (isNaN(min) || min < 0 || min > 59) {
        setFormError('Minute must be between 00 and 59.');
        return;
      }
    }

    setSyncError(null);
    setIsSyncing(true);
    setSyncAttempt(0);

    try {
      let formHour24 = parseInt(formData.apptHour, 10);
      if (isNaN(formHour24)) formHour24 = 12;
      if (formData.apptAmPm === 'PM' && formHour24 < 12) formHour24 += 12;
      if (formData.apptAmPm === 'AM' && formHour24 === 12) formHour24 = 0;
      
      const paddedHour = formHour24.toString().padStart(2, '0');
      const paddedMin = (formData.apptMinute || '00').padStart(2, '0');
      const synthesizedAppointmentTime = `${formData.apptDate}T${paddedHour}:${paddedMin}`;

      const finalDataToSave = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        windowCount: Number(formData.windowCount) || 0,
        aglCount: Number(formData.aglCount) || 0,
        notes: formData.notes,
        serviceType: formData.serviceType,
        assignedTo: formData.assignedTo,
        appointmentTime: synthesizedAppointmentTime
      };

      let currentDocId = editingId;
      let finalCalendarEventId = editingId 
        ? customers.find(c => c.id === editingId)?.calendarEventId 
        : undefined;

      if (editingId) {
        // Update existing customer
        await updateDoc(doc(db, 'customers', editingId), {
          ...finalDataToSave,
          completed: false, // Reactivate on save so they pop back onto the active dashboard
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create new customer
        const docRef = await addDoc(collection(db, 'customers'), {
          ...finalDataToSave,
          completed: false,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        currentDocId = docRef.id;
        setEditingId(currentDocId); // Prevent duplicate creations on retry
      }

      // 2. Add or Update to Google Calendar if tokens exist
      if (googleTokens && currentDocId) {
        const apptDateObj = new Date(synthesizedAppointmentTime);
        const isoStart = apptDateObj.toISOString();
        const isoEnd = new Date(apptDateObj.getTime() + 60 * 60 * 1000).toISOString();
        
        let syncSuccess = false;
        let lastSyncError = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          setSyncAttempt(attempt);
          try {
            const res = await fetch('/api/calendar/event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tokens: googleTokens,
                event: {
                  ...finalDataToSave,
                  isoStart,
                  isoEnd,
                  calendarEventId: finalCalendarEventId
                }
              })
            });
            
            const calData = await res.json();
            if (!res.ok) {
              throw new Error(calData.error || 'Server error syncing with Google Calendar');
            }

            const updateObj: any = {};
            if (calData.id && calData.id !== finalCalendarEventId) {
              updateObj.calendarEventId = calData.id;
            }
            if (calData.htmlLink) {
              updateObj.calendarLink = calData.htmlLink;
            }
            
            if (Object.keys(updateObj).length > 0) {
              updateObj.updatedAt = serverTimestamp();
              await updateDoc(doc(db, 'customers', currentDocId), updateObj);
            }
            
            syncSuccess = true;
            break; // Exit the retry loop on success
          } catch (calErr: any) {
            console.error(`Failed to sync calendar event (Attempt ${attempt})`, calErr);
            lastSyncError = calErr;
            const errMsg = calErr.message || String(calErr);
            if (errMsg === 'invalid_grant' || errMsg.includes('invalid_grant')) {
              break; // Don't retry if the grant is definitively invalid
            }
            if (attempt < 3) {
              // Wait 1 second before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        if (!syncSuccess && lastSyncError) {
          const errMsg = lastSyncError.message || String(lastSyncError);
          const lowerMsg = errMsg.toLowerCase();
          
          if (lowerMsg.includes('invalid_grant')) {
            setSyncError(`Calendar connection expired or was revoked. Please click 'Link Calendar' on your dashboard to sign in again and ensure permissions are granted. Your data was successfully saved to the APEX database.`);
            setGoogleTokens(null);
            localStorage.removeItem('google_calendar_tokens');
          } else if (lowerMsg.includes('rate limit') || lowerMsg.includes('quota')) {
            setSyncError(`Google Calendar rate limit exceeded. Please wait a few moments and try syncing again. Your data was securely saved to the APEX database.`);
          } else if (lowerMsg.includes('insufficient permission') || lowerMsg.includes('forbidden')) {
            setSyncError(`We don't have permission to modify your calendar. Please reconnect your Google account and ensure you check the box granting Calendar access. Your data was successfully saved to the APEX database.`);
          } else {
            setSyncError(`Calendar sync failed: ${errMsg}. Don't worry, your data was saved to the APEX database.`);
          }
          
          setIsSyncing(false); // Make sure syncing state is cleared
          return; // Don't close the form so the user can read the error
        }
      }

      resetForm();
      setShowAddForm(false);
    } catch (err) {
      console.error('Error saving customer:', err);
      setSyncError('Failed to save to database. Check your connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  const openInMaps = (address: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const handleStartRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      await addDoc(collection(db, 'routes'), {
        date: format(new Date(), 'yyyy-MM-dd'),
        startOdometer: Number(odometerInput),
        currentOdometer: Number(odometerInput),
        status: 'active',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setOdometerInput('');
      setShowRouteModal(null);
    } catch (err) {
      console.error('Failed to start route', err);
    }
  };

  const activeRoute = dailyRoutes.find(r => r.status === 'active' && r.date === format(new Date(), 'yyyy-MM-dd'));

  const handleEndRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoute) return;
    
    try {
      await updateDoc(doc(db, 'routes', activeRoute.id), {
        endOdometer: Number(odometerInput),
        currentOdometer: Number(odometerInput),
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      setOdometerInput('');
      setShowRouteModal(null);
    } catch (err) {
      console.error('Failed to end route', err);
    }
  };

  const calculateJobMileage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoute || !showJobMileageModal) return;

    const endOdo = Number(odometerInput);
    const mileageUsed = endOdo - activeRoute.currentOdometer;

    if (mileageUsed < 0) {
      alert("Current odometer cannot be less than previous odometer.");
      return;
    }

    try {
      // 1. Tag the customer with the mileage cost
      await updateDoc(doc(db, 'customers', showJobMileageModal), {
        mileageAttributed: mileageUsed,
        updatedAt: serverTimestamp()
      });

      // 2. Update the route's current odometer marker
      await updateDoc(doc(db, 'routes', activeRoute.id), {
        currentOdometer: endOdo,
        updatedAt: serverTimestamp()
      });

      setOdometerInput('');
      setShowJobMileageModal(null);
    } catch (err) {
      console.error('Failed to attribute mileage', err);
    }
  };

  const generateTaxReport = () => {
    if (dailyRoutes.length === 0) {
      alert("No routes to export.");
      return;
    }
    
    const headers = ["Date", "Start Odometer", "End Odometer", "Total Mileage"];
    const rows = dailyRoutes.map(route => {
      const start = route.startOdometer || 0;
      const end = route.endOdometer || route.currentOdometer || 0;
      const total = end > start ? end - start : 0;
      return [route.date, start, end, total].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `apex_tax_mileage_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newEmployeeName.trim()) return;
    setIsAddingEmployee(true);
    try {
      await addDoc(collection(db, 'employees'), {
        name: newEmployeeName.trim(),
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      setNewEmployeeName('');
    } catch (err) {
      console.error("Failed to add employee:", err);
    }
    setIsAddingEmployee(false);
  };

  const handleDeleteEmployee = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name} from your team?`)) {
      try {
        await deleteDoc(doc(db, 'employees', id));
      } catch (err) {
        console.error("Failed to delete employee:", err);
      }
    }
  };

  // Map Assistant State
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: "Hello! I'm your APEX Map Assistant. How can I help you optimize your service route today?" }
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const handleAssistantSend = async () => {
    if (!assistantInput.trim() || isAssistantLoading) return;

    const userMessage = assistantInput.trim();
    setAssistantMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAssistantInput('');
    setIsAssistantLoading(true);

    try {
      const activeJobs = customers.filter(c => !c.completed);
      const jobsContext = activeJobs.map(j => ({
        name: j.name,
        address: j.address,
        time: format(parseISO(j.appointmentTime), 'h:mm a'),
        windows: j.windowCount,
        agl: j.aglCount,
        notes: j.notes
      }));

      const systemPrompt = `You are the APEX Map Assistant, a specialized AI for a window cleaning and service management app.
Your goal is to help the user manage their jobs, optimize their route, and answer questions about their schedule.
Current context:
- User: ${user?.displayName || 'Service Tech'}
- Date: ${format(new Date(), 'EEEE, MMMM do, yyyy')}
- Filtered Jobs: ${JSON.stringify(jobsContext)}

Provide concise, helpful, and professional advice. Focus on efficiency and customer service.
If asked about a route, suggest a logical order based on the addresses and appointment times provided.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...assistantMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });

      const assistantContent = response.text || "I'm sorry, I couldn't process that request at the moment.";
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: assistantContent }]);
    } catch (err) {
      console.error("Gemini Assistant Error:", err);
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting right now. Please try again in a moment." }]);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full luxury-card p-12 text-center border-accent/20"
        >
          <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(197,160,89,0.3)]">
            <Layout className="text-black w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif mb-4 tracking-wider text-text-primary">APEX SERVICES</h1>
          <p className="text-text-secondary mb-10 text-sm leading-relaxed tracking-wide uppercase italic">
            Elite service management.
          </p>
          <button 
            onClick={signInWithGoogle}
            className="btn-luxury-primary w-full shadow-[0_0_20px_rgba(197,160,89,0.2)]"
          >
            Authenticate with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (printSingleCustomer) {
    return (
      <div className="bg-white text-black min-h-screen p-8 print:p-0 print:m-0 font-sans text-sm pb-10">
        <div className="no-print mb-6 flex justify-between items-center bg-gray-100 p-4 rounded-md shadow-sm">
          <p className="text-sm font-bold text-gray-700">Print View Ready.</p>
          <div className="flex gap-4">
            <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-bold shadow transition-colors">Print</button>
            <button onClick={() => setPrintSingleCustomer(null)} className="bg-gray-300 hover:bg-gray-400 text-black px-5 py-2 rounded font-bold shadow transition-colors">Exit</button>
          </div>
        </div>

        <div className="print-content max-w-2xl mx-auto align-top">
          <h1 className="text-3xl font-bold mb-1 text-black">{printSingleCustomer.name}</h1>
                        <p className="text-lg text-gray-700 mb-8 border-b border-gray-300 pb-4 font-serif italic">
            Scheduled: {format(new Date(printSingleCustomer.appointmentTime), 'MMM dd, yyyy h:mm a')}
          </p>
          
          <div className="grid grid-cols-2 gap-8 mb-8 bg-gray-50 p-6 rounded border border-gray-200">
             <div>
                <p className="uppercase text-[10px] font-bold text-gray-500 tracking-widest mb-1">Address</p>
                <p className="text-black text-base font-medium">{printSingleCustomer.address}</p>
             </div>
             <div>
                <p className="uppercase text-[10px] font-bold text-gray-500 tracking-widest mb-1">Phone</p>
                <p className="text-black text-base font-medium">{printSingleCustomer.phone}</p>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8 px-6">
             <div>
                <p className="uppercase text-[10px] font-bold text-gray-500 tracking-widest mb-1">Windows</p>
                <p className="text-black text-2xl font-serif italic">{printSingleCustomer.windowCount}</p>
             </div>
             <div>
                <p className="uppercase text-[10px] font-bold text-gray-500 tracking-widest mb-1">AGL Levels</p>
                <p className="text-black text-2xl font-serif italic">{printSingleCustomer.aglCount}</p>
             </div>
          </div>

          {printSingleCustomer.notes && (
             <div className="mb-8 p-6 bg-white border-l-4 border-[#e91e63] shadow-sm">
                <p className="uppercase text-[10px] font-bold text-[#e91e63] tracking-widest mb-2 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Special Instructions
                </p>
                <p className="text-black whitespace-pre-wrap leading-relaxed font-serif text-base">{printSingleCustomer.notes}</p>
             </div>
          )}

          {printSingleCustomer.serviceLogs && printSingleCustomer.serviceLogs.length > 0 && (
              <div className="mt-12">
                 <p className="uppercase text-[10px] font-bold text-gray-500 tracking-widest mb-4 border-b border-gray-300 pb-2">Service History Log</p>
                 <div className="space-y-4">
                   {printSingleCustomer.serviceLogs.map(log => (
                      <div key={log.id} className="bg-gray-50 p-4 rounded border border-gray-100">
                         <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-black text-base">{log.type}</span>
                            <span className="text-gray-500 font-medium text-sm bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
                              {format(new Date(log.date + 'T12:00:00'), 'MMM dd, yyyy')}
                            </span>
                         </div>
                         {log.notes && <p className="text-sm mt-3 text-gray-700 leading-relaxed bg-white p-3 rounded border border-gray-200">{log.notes}</p>}
                      </div>
                   ))}
                 </div>
              </div>
          )}
        </div>
      </div>
    );
  }

  if (isPrinting) {
    const printJobs = customers
      .filter(c => !c.completed && c.appointmentTime.startsWith(printDate))
      .sort((a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime());
      
    const sHour = printJobs.length > 0 ? Math.min(7, ...printJobs.map(j => new Date(j.appointmentTime).getHours())) : 7;
    const eHour = printJobs.length > 0 ? Math.max(18, ...printJobs.map(j => new Date(j.appointmentTime).getHours() + 1)) : 18;
    const timelineHours = Array.from({length: eHour - sHour + 1}, (_, i) => i + sHour);

    return (
      <div className="bg-white text-black min-h-screen p-8 print:p-0 print:m-0 font-sans text-sm">
        <div className="no-print mb-6 flex justify-between items-center bg-gray-100 p-4 rounded-md shadow-sm">
          <p className="text-sm font-bold text-gray-700">Print View Ready. Adjust paper orientation as needed.</p>
          <div className="flex gap-4">
            <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-bold shadow transition-colors">Print</button>
            <button onClick={() => setIsPrinting(false)} className="bg-gray-300 hover:bg-gray-400 text-black px-5 py-2 rounded font-bold shadow transition-colors">Exit</button>
          </div>
        </div>

        <div className="print-content max-w-5xl mx-auto align-top">
          <h1 className="text-4xl font-bold mb-8 text-black">{format(new Date(`${printDate}T12:00:00`), 'EEEE, MMMM do')}</h1>
          
          <div className="grid grid-cols-12 gap-8 align-top">
            {/* Timeline Left */}
            <div className="col-span-5 relative pl-12">
              {timelineHours.map(hour => (
                <div key={hour} className="h-20 border-b border-gray-300 relative border-l border-gray-300">
                  <span className="absolute -left-12 -top-2.5 w-10 text-right text-[10px] font-bold text-black uppercase">
                    {hour > 12 ? `${hour - 12} PM` : hour === 12 ? 'Noon' : `${hour} AM`}
                  </span>
                </div>
              ))}
              {/* Event blocks */}
              {printJobs.map(job => {
                const d = new Date(job.appointmentTime);
                const h = d.getHours();
                const m = d.getMinutes();
                const topOffset = ((h - sHour) + (m / 60)) * 5; 
                return (
                  <div 
                    key={`cal-${job.id}`}
                    className="absolute left-[1px] w-[95%] border-l-[6px] pl-2 py-1 overflow-hidden"
                    style={{ 
                       top: `${topOffset}rem`, 
                       height: '5rem', 
                       borderColor: '#e91e63',
                       backgroundColor: 'rgba(233, 30, 99, 0.05)',
                       WebkitPrintColorAdjust: 'exact', 
                       printColorAdjust: 'exact'
                    }}
                  >
                    <div className="text-[10px] font-bold leading-tight text-black">{format(d, 'h:mm a')} {job.name}</div>
                    <div className="text-[10px] text-gray-700 truncate">{job.address}</div>
                  </div>
                );
              })}
            </div>

            {/* Details Right */}
            <div className="col-span-7 flex flex-col gap-6 pl-6 border-l border-gray-300 relative">
              <h3 className="text-[10px] text-gray-500 font-bold uppercase mb-2 absolute top-0 -mt-4 bg-white px-2">• Timed Events</h3>
              {printJobs.map(job => {
                const d = new Date(job.appointmentTime);
                const endD = new Date(d.getTime() + 60 * 60 * 1000);
                const lastService = job.serviceLogs?.[0];
                return (
                  <div key={`dtl-${job.id}`} className="text-[11px] leading-relaxed flex gap-3 text-black">
                    <div 
                       className="w-2 h-4 mt-0.5 flex-shrink-0" 
                       style={{ 
                          backgroundColor: '#e91e63',
                          WebkitPrintColorAdjust: 'exact', 
                          printColorAdjust: 'exact' 
                       }} 
                    />
                    <div className="flex-1">
                      <p className="font-bold">{format(d, 'h:mm a')} to {format(endD, 'h:mm a')} {job.name}</p>
                      <p><span className="font-bold">Location:</span> {job.address}</p>
                      <p><span className="font-bold">Phone:</span> {job.phone}</p>
                      {job.notes && (
                        <p className="whitespace-pre-wrap"><span className="font-bold">Notes:</span> {job.notes}</p>
                      )}
                      <p className="mt-1 uppercase text-[10px]"><span className="font-bold">Specs:</span> {job.windowCount} Windows, {job.aglCount} AGL</p>
                      {lastService && (
                        <p className="mt-1 text-gray-600 font-bold italic">
                          Last Service: {format(new Date(lastService.date + 'T12:00:00'), 'M/d/yy')} - {lastService.type}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {printJobs.length === 0 && (
                <p className="text-gray-500 italic text-sm mt-4">No active appointments scheduled for this date.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-bg border-b border-border px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-text-secondary hover:text-white transition-colors p-2 -ml-2 sm:hidden"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 border border-accent rounded-full flex items-center justify-center">
            <Layout className="text-accent w-5 h-5" />
          </div>
          <h1 className="font-serif text-xl text-accent tracking-[0.2em] hidden sm:block">APEX</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-6 mr-4 border-r border-border pr-6">
            <button 
              onClick={() => setCurrentRoute('dashboard')}
              className={`label-caps transition-colors ${currentRoute === 'dashboard' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setCurrentRoute('history')}
              className={`label-caps transition-colors ${currentRoute === 'history' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
            >
              Job History
            </button>
            <button 
              onClick={() => setCurrentRoute('directory')}
              className={`label-caps transition-colors ${currentRoute === 'directory' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
            >
              Directory
            </button>
            <button 
              onClick={() => setCurrentRoute('team')}
              className={`label-caps transition-colors ${currentRoute === 'team' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
            >
              Team
            </button>
            <button 
              onClick={() => setCurrentRoute('help')}
              className={`label-caps transition-colors ${currentRoute === 'help' ? 'text-accent' : 'text-text-secondary hover:text-white'}`}
            >
              Training
            </button>
          </div>
          {/* Offline/Online Indicator */}
          <div className={`text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 px-3 py-1.5 rounded-sm border ${isOnline ? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-500' : 'border-red-900/50 bg-red-950/20 text-red-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline Mode'}</span>
          </div>
          
          <select 
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="bg-transparent border border-border text-text-secondary text-[10px] uppercase font-bold tracking-widest pl-2 pr-6 py-1.5 rounded-sm outline-none cursor-pointer hover:border-accent/40"
          >
            <option value="dark">Classic (Dark)</option>
            <option value="light">Classic (Light)</option>
            <option value="midnight">Modern Midnight</option>
            <option value="forest">Modern Forest</option>
          </select>

          <button onClick={() => auth.signOut()} className="text-text-secondary hover:text-text-primary transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-50 flex sm:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-64 bg-surface h-full border-r border-border shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h2 className="font-serif text-xl text-accent tracking-[0.2em]">APEX</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="text-text-secondary hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <button 
                  onClick={() => { setCurrentRoute('dashboard'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 w-full text-left p-4 rounded-sm label-caps ${currentRoute === 'dashboard' ? 'bg-bg border border-accent/20 text-accent' : 'text-text-secondary hover:bg-bg'}`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </button>
                <button 
                  onClick={() => { setCurrentRoute('history'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 w-full text-left p-4 rounded-sm label-caps ${currentRoute === 'history' ? 'bg-bg border border-accent/20 text-accent' : 'text-text-secondary hover:bg-bg'}`}
                >
                  <History className="w-4 h-4" /> Job History
                </button>
                <button 
                  onClick={() => { setCurrentRoute('directory'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 w-full text-left p-4 rounded-sm label-caps ${currentRoute === 'directory' ? 'bg-bg border border-accent/20 text-accent' : 'text-text-secondary hover:bg-bg'}`}
                >
                  <Users className="w-4 h-4" /> Directory
                </button>
                <button 
                  onClick={() => { setCurrentRoute('team'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 w-full text-left p-4 rounded-sm label-caps ${currentRoute === 'team' ? 'bg-bg border border-accent/20 text-accent' : 'text-text-secondary hover:bg-bg'}`}
                >
                  <UserIcon className="w-4 h-4" /> Team
                </button>
                <button 
                  onClick={() => { setCurrentRoute('help'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 w-full text-left p-4 rounded-sm label-caps ${currentRoute === 'help' ? 'bg-bg border border-accent/20 text-accent' : 'text-text-secondary hover:bg-bg'}`}
                >
                  <ClipboardList className="w-4 h-4" /> Training
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className={`flex-1 w-full mx-auto p-8 pb-32 ${currentRoute === 'dashboard' ? 'max-w-7xl' : 'max-w-2xl'}`}>
        {currentRoute === 'dashboard' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Left Column: Command Center Calendar */}
            <div className="xl:col-span-8 flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row items-center justify-between">
                <div>
                  <h2 className="text-4xl font-serif text-text-primary mb-2">Command Center</h2>
                  <div className="flex items-center gap-4">
                    <p className="label-caps italic">{format(new Date(), 'EEEE, MMMM do')}</p>
                    
                    {activeRoute ? (
                      <button 
                        onClick={() => setShowRouteModal('end')}
                        className="text-[10px] border border-red-900/50 bg-red-950/20 text-red-400 px-3 py-1 rounded-sm font-bold uppercase tracking-widest hover:bg-red-900/30 transition-colors animate-pulse"
                      >
                        End Route
                      </button>
                    ) : (
                      <button 
                        onClick={() => setShowRouteModal('start')}
                        className="text-[10px] border border-emerald-900/50 bg-emerald-950/20 text-emerald-400 px-3 py-1 rounded-sm font-bold uppercase tracking-widest hover:bg-emerald-900/30 transition-colors"
                      >
                        Start Route
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4 sm:mt-0">
                  <button 
                    onClick={() => setPrintSelectOpen(true)}
                    className="p-3 bg-surface border border-border rounded-sm text-text-secondary hover:text-text-primary hover:border-accent/40 transition-all font-bold"
                    title="Print Active Schedule"
                  >
                    <Printer className="w-5 h-5 text-accent" />
                  </button>
                  <button 
                    onClick={handleOpenAddForm}
                    className="flex items-center gap-2 bg-accent text-white font-bold py-3 px-5 rounded-sm uppercase tracking-[0.1em] text-[11px] hover:-translate-y-0.5 active:scale-95 transition-all shadow-lg shadow-accent/20"
                    title="New Intake"
                  >
                    <Plus className="w-4 h-4" /> New Job
                  </button>
                </div>
              </div>

              {/* Calendar Widget */}
              <div className="luxury-card p-6 flex-1 flex flex-col min-h-[500px]">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <h3 className="text-xl font-serif text-text-primary">{format(currentMonth, 'MMMM yyyy')}</h3>
                    
                    <div className="flex items-center gap-3">
                      {!googleTokens && (
                        <button 
                          onClick={handleConnectCalendar}
                          className="text-[10px] border border-amber-900/50 bg-amber-950/20 text-accent px-3 py-1 rounded-sm font-bold uppercase tracking-widest hover:bg-amber-900/30 transition-colors"
                        >
                          Link Calendar
                        </button>
                      )}
                      
                      {googleTokens && (
                        <>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 text-emerald-500/80">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            Live Sync
                          </div>
                          <button
                            onClick={() => {
                              setGoogleTokens(null);
                              localStorage.removeItem('google_calendar_tokens');
                            }}
                            className="text-[9px] uppercase font-bold tracking-widest text-text-secondary hover:text-red-400 transition-colors pl-2 border-l border-border/50"
                          >
                            Disconnect
                          </button>
                          <a 
                            href="https://calendar.google.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[9px] uppercase font-bold tracking-widest text-text-secondary hover:text-accent transition-colors flex items-center gap-1 pl-2 border-l border-border/50"
                            title="Open Google Calendar"
                          >
                            Open ↗
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 border border-border bg-bg text-text-secondary hover:text-text-primary rounded-sm transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }} className="px-4 py-2 text-[10px] uppercase font-bold tracking-widest border border-border bg-bg text-text-secondary hover:text-text-primary rounded-sm transition-colors">
                      Today
                    </button>
                    <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 border border-border bg-bg text-text-secondary hover:text-text-primary rounded-sm transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-px flex-1 border border-border rounded-sm overflow-hidden text-center label-caps">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="bg-surface py-3 border-b border-border text-[9px]">{d}</div>
                  ))}
                  {(() => {
                    const mStart = startOfMonth(currentMonth);
                    const weekStart = startOfWeek(mStart);
                    const weekEnd = endOfWeek(endOfMonth(mStart));
                    let daysArr = [];
                    let d = weekStart;
                    while (d <= weekEnd || daysArr.length % 7 !== 0) { daysArr.push(d); d = addDays(d, 1); }
                    return Object.values(daysArr).map((day, idx) => {
                      const isSel = isSameDay(day, selectedDate);
                      const isCurM = isSameMonth(day, currentMonth);
                      const isT = isSameDay(day, new Date());
                      const dayJobs = customers.filter(c => !c.completed && isSameDay(parseISO(c.appointmentTime), day));
                      
                      return (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedDate(day)}
                          className={`min-h-[5rem] sm:min-h-[7rem] bg-surface p-1 sm:p-2 flex flex-col cursor-pointer transition-colors border-b border-r border-border hover:bg-bg
                            ${!isCurM ? 'opacity-30' : ''}
                            ${isSel ? 'bg-accent/10 border-accent/40' : ''}
                          `}
                        >
                          <div className={`text-right text-xs mb-1 font-bold ${isT ? 'text-accent' : 'text-text-secondary'} ${isSel ? 'text-accent' : ''}`}>
                            {format(day, 'd')}
                          </div>
                          <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                            {dayJobs.slice(0,3).map(j => (
                              <div key={j.id} className="text-[9px] text-left leading-tight bg-bg text-text-primary border border-border px-1 py-0.5 rounded-sm line-clamp-1 truncate shadow-sm">
                                {format(parseISO(j.appointmentTime), 'h:mm')} {j.name}
                              </div>
                            ))}
                            {dayJobs.length > 3 && (
                              <div className="text-[8px] text-text-secondary text-right mt-auto pr-1">+{dayJobs.length - 3}</div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>

            {/* Right Column: Next 3 Jobs Display */}
            <div className="xl:col-span-4 flex flex-col gap-6 pt-2">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h3 className="label-caps">Selected Agenda</h3>
                  <p className="text-sm font-serif text-text-primary mt-1">{format(selectedDate, 'EEEE, MMM do')}</p>
                </div>
                <div className="text-[10px] text-accent border border-accent/30 bg-accent/10 px-2 py-1 rounded-sm uppercase tracking-widest font-bold">
                  {customers.filter(c => !c.completed && isSameDay(parseISO(c.appointmentTime), selectedDate)).length} Jobs
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {(() => {
                  const dayJobs = customers
                    .filter(c => !c.completed && isSameDay(parseISO(c.appointmentTime), selectedDate))
                    .sort((a,b) => parseISO(a.appointmentTime).getTime() - parseISO(b.appointmentTime).getTime());

                  if (dayJobs.length === 0) {
                    return (
                      <div className="text-center py-16 bg-surface/30 rounded-sm border border-border border-dashed">
                        <CalendarDays className="w-10 h-10 text-border mx-auto mb-3" />
                        <p className="label-caps">No jobs selected</p>
                        <p className="text-xs text-text-secondary mt-2">Select a date with jobs to view agenda</p>
                      </div>
                    )
                  }

                  return dayJobs.slice(0, 3).map(customer => (
                    <motion.div layout key={customer.id} className="luxury-card p-5 relative border-l-[3px] border-l-accent overflow-hidden">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="text-lg font-serif text-text-primary leading-tight max-w-[80%] break-words">
                          {customer.name}
                        </h4>
                        <span className="flex-shrink-0 text-[10px] font-bold text-text-secondary bg-bg px-2 py-1 rounded-sm shadow-sm border border-border whitespace-nowrap">
                          {format(parseISO(customer.appointmentTime), 'h:mm a')}
                        </span>
                      </div>
                      
                      <div className="flex items-start gap-2 mb-4 text-text-secondary">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] leading-relaxed line-clamp-2">{customer.address}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-4 text-center">
                        <div className="bg-bg border border-border py-2 rounded-sm">
                          <p className="text-[9px] uppercase font-bold text-text-secondary tracking-widest mb-1">Windows</p>
                          <p className="font-serif text-text-primary text-sm">{customer.windowCount}</p>
                        </div>
                        <div className="bg-bg border border-border py-2 rounded-sm">
                          <p className="text-[9px] uppercase font-bold text-text-secondary tracking-widest mb-1">AGL</p>
                          <p className="font-serif text-text-primary text-sm">{customer.aglCount}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleToggleComplete(customer)}
                          className="flex-1 bg-surface border border-border text-text-secondary hover:bg-accent hover:text-white hover:border-accent text-[10px] uppercase font-bold tracking-widest py-2 rounded-sm transition-all shadow-sm"
                        >
                          Complete
                        </button>
                        <button 
                          onClick={() => openInMaps(customer.address)}
                          className="px-3 bg-bg border border-border text-text-secondary hover:text-text-primary uppercase tracking-widest font-bold text-[10px] rounded-sm transition-all"
                          title="Open Maps"
                        >
                          <Navigation className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                })()}
                
                {customers.filter(c => !c.completed && isSameDay(parseISO(c.appointmentTime), selectedDate)).length > 3 && (
                  <div className="text-center py-3 border border-border border-dashed bg-surface/50 rounded-sm">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">+ {customers.filter(c => !c.completed && isSameDay(parseISO(c.appointmentTime), selectedDate)).length - 3} more jobs this day</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentRoute === 'history' && (
          /* History View */
          <>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-serif text-text-primary mb-2">Job Archive</h2>
                <p className="label-caps italic">Comprehensive history</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 mb-8 p-6 bg-surface border border-border rounded-sm">
              <div className="w-full">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input 
                    type="text"
                    placeholder="Search history by name or address..."
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    className="w-full bg-bg border border-border rounded-sm pl-10 pr-4 py-2.5 text-text-primary outline-none focus:border-accent transition-all text-sm placeholder:text-text-secondary/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex-1">
                  <label className="label-caps block mb-2 text-xs">Filter Status</label>
                  <div className="relative">
                    <select 
                      value={historyFilter}
                      onChange={(e) => setHistoryFilter(e.target.value as any)}
                      className="w-full appearance-none bg-bg border border-border rounded-sm px-4 py-2.5 text-text-primary outline-none focus:border-accent text-sm"
                    >
                      <option value="all">All Jobs</option>
                      <option value="active">Active Only</option>
                      <option value="completed">Completed Only</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="label-caps block mb-2 text-xs">Service Type</label>
                  <div className="relative">
                    <select 
                      value={historyServiceFilter}
                      onChange={(e) => setHistoryServiceFilter(e.target.value)}
                      className="w-full appearance-none bg-bg border border-border rounded-sm px-4 py-2.5 text-text-primary outline-none focus:border-accent text-sm"
                    >
                      <option value="all">All Services</option>
                      <option value="Window Cleaning">Window Cleaning</option>
                      <option value="Gutter Cleaning">Gutter Cleaning</option>
                      <option value="Power Washing">Power Washing</option>
                      <option value="Solar Panel Cleaning">Solar Panel Cleaning</option>
                      <option value="Screen Repair">Screen Repair</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="label-caps block mb-2 text-xs">Filter Date</label>
                  <input 
                    type="date"
                    value={historyDateFilter}
                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                    className="w-full bg-bg border border-border rounded-sm px-4 py-2 text-text-primary outline-none focus:border-accent text-sm h-[42px]"
                  />
                </div>
                <div className="flex-1">
                  <label className="label-caps block mb-2 text-xs">Sort Order</label>
                  <div className="relative">
                    <select 
                      value={historySort}
                      onChange={(e) => setHistorySort(e.target.value as any)}
                      className="w-full appearance-none bg-bg border border-border rounded-sm px-4 py-2.5 text-text-primary outline-none focus:border-accent text-sm"
                    >
                      <option value="dateDesc">Newest First</option>
                      <option value="dateAsc">Oldest First</option>
                      <option value="nameAsc">Customer Name (A-Z)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-6 flex justify-end">
              <button 
                onClick={generateTaxReport}
                className="flex items-center gap-2 btn-luxury-outline px-6 text-xs"
              >
                <Download className="w-4 h-4" /> Export Mileage CSV
              </button>
            </div>

            <div className="space-y-6">
              {customers
                .filter(c => {
                  if (historySearchQuery) {
                    const q = historySearchQuery.toLowerCase();
                    if (!c.name.toLowerCase().includes(q) && 
                        !c.address.toLowerCase().includes(q) && 
                        !c.phone.toLowerCase().includes(q)) {
                      return false;
                    }
                  }
                  if (historyFilter === 'active') {
                    if (c.completed) return false;
                  }
                  if (historyFilter === 'completed') {
                    if (!c.completed) return false;
                  }
                  if (historyServiceFilter !== 'all') {
                    if (c.serviceType !== historyServiceFilter) return false;
                  }
                  if (historyDateFilter) {
                    if (!c.appointmentTime.startsWith(historyDateFilter)) return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  if (historySort === 'nameAsc') return a.name.localeCompare(b.name);
                  const timeA = new Date(a.appointmentTime).getTime();
                  const timeB = new Date(b.appointmentTime).getTime();
                  return historySort === 'dateAsc' ? timeA - timeB : timeB - timeA;
                })
                .map(customer => (
                  <div key={customer.id} className={`luxury-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${customer.completed ? 'opacity-60' : ''}`}>
                    <div>
                      <h4 className="text-lg font-serif text-text-primary">{customer.name}</h4>
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-text-secondary mt-1">{format(new Date(customer.appointmentTime), 'MMM dd, yyyy h:mm a')}</p>
                        {customer.serviceType && (
                          <span className="text-[10px] text-accent border border-accent/30 bg-accent/10 px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest mt-1">
                            {customer.serviceType}
                          </span>
                        )}
                        {customer.assignedTo && customer.assignedTo !== 'Unassigned' && (
                          <span className="text-[10px] text-accent border border-accent/30 bg-accent/10 px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest mt-1">
                            {customer.assignedTo}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2 mt-4 sm:mt-0">
                      <div className="flex items-center gap-3">
                        <span className={`label-caps ${customer.completed ? 'text-text-secondary' : 'text-accent'}`}>
                          {customer.completed ? 'Completed' : 'Active'}
                        </span>
                        <p className="text-xs text-text-secondary/70 truncate max-w-[200px] hidden sm:block">{customer.address}</p>
                        {customer.mileageAttributed && (
                          <span className="text-[10px] bg-emerald-950/30 text-emerald-400 border border-emerald-900/50 px-2 py-0.5 rounded-sm font-mono flex items-center gap-1">
                            <Navigation className="w-3 h-3" /> {customer.mileageAttributed}mi
                          </span>
                        )}
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mt-1 w-full sm:w-auto justify-between sm:justify-end">
                        <p className="text-xs text-text-secondary/70 truncate sm:hidden block">{customer.address}</p>
                        <div className="flex items-center gap-2">
                          {deletingId === customer.id ? (
                            <div className="flex items-center gap-1 bg-red-950/40 border border-red-900/50 rounded-sm p-0.5">
                              <button 
                                onClick={() => handleDeleteClient(customer.id)}
                                className="px-2 py-1 text-[10px] font-bold text-red-500 hover:text-white uppercase tracking-widest transition-colors"
                              >
                                Confirm
                              </button>
                              <button 
                                onClick={() => setDeletingId(null)}
                                className="p-1 text-text-secondary hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeletingId(customer.id)}
                              className="p-1.5 bg-surface border border-border rounded-sm text-red-500/50 hover:text-red-500 hover:border-red-500/40 active:scale-95 transition-all"
                              title="Delete Customer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleEditClick(customer)}
                            className="p-1.5 bg-surface border border-border rounded-sm text-text-secondary hover:text-accent hover:border-accent/40 active:scale-95 transition-all"
                            title="Edit Customer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <a 
                            href={`tel:${customer.phone}`}
                            className="p-1.5 bg-surface border border-border rounded-sm text-text-secondary hover:text-accent hover:border-accent/40 active:scale-95 transition-all"
                            title="Call Customer"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                          <button 
                            onClick={() => openInMaps(customer.address)}
                            className="p-1.5 bg-surface border border-border rounded-sm text-text-secondary hover:text-accent hover:border-accent/40 active:scale-95 transition-all"
                            title="Directions"
                          >
                            <Navigation className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setHistoryModalCustomerId(customer.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-sm text-text-secondary hover:text-accent hover:border-accent/40 active:scale-95 transition-all"
                            title="Add Service Log"
                          >
                            <ClipboardList className="w-4 h-4" />
                            <span className="text-[10px] uppercase font-bold tracking-widest hidden sm:inline">Log</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
              ))}
              
              {customers.length === 0 && (
                <div className="text-center py-24 bg-surface/30 rounded-sm border border-border border-dashed">
                  <History className="w-12 h-12 text-border mx-auto mb-4" />
                  <p className="label-caps">Archive is empty</p>
                </div>
              )}
            </div>
          </>
        )}

        {currentRoute === 'directory' && (
          <>
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
              <div className="w-full sm:w-auto">
                <h2 className="text-3xl font-serif text-text-primary mb-2">Customer Directory</h2>
                <p className="label-caps italic">All known clients & prospects</p>
              </div>
              <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-4">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input 
                    type="text"
                    placeholder="Search by name, address..."
                    value={directorySearchQuery}
                    onChange={(e) => setDirectorySearchQuery(e.target.value)}
                    className="w-full bg-surface border border-border rounded-sm pl-10 pr-4 py-2.5 text-text-primary outline-none focus:border-accent transition-all text-sm placeholder:text-text-secondary/50"
                  />
                </div>
                {!hasImported && (
                  <button 
                    onClick={handleImportMaps}
                    disabled={isImporting}
                    className="btn-luxury flex items-center justify-center gap-2 whitespace-nowrap bg-emerald-950/20 text-emerald-500 border border-emerald-900/50 hover:bg-emerald-900/30 transition-all opacity-80 hover:opacity-100"
                  >
                    {isImporting ? (
                      <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isImporting ? 'Importing...' : 'Import 27 Leads'}
                  </button>
                )}
                <button 
                  onClick={handleOpenAddForm}
                  className="btn-luxury-primary flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  New Entry
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {customers
                .filter(c => {
                  if (!directorySearchQuery) return true;
                  const q = directorySearchQuery.toLowerCase();
                  return c.name.toLowerCase().includes(q) || 
                         c.address.toLowerCase().includes(q) || 
                         c.phone.toLowerCase().includes(q);
                })
                .sort((a, b) => a.name.localeCompare(b.name)) /* Simple alphabetical sort */
                .map((customer) => (
                  <div key={`dir-${customer.id}`} className="bg-bg border border-border p-5 rounded-sm hover:border-accent/40 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      
                      {/* Name & Basic Info */}
                      <div className="flex flex-col flex-1">
                        <div className="flex items-start gap-3 mb-2">
                          <h4 className="text-lg font-serif text-text-primary tracking-wide">{customer.name}</h4>
                          {customer.completed ? (
                            <span className="px-2 py-0.5 bg-emerald-950/30 border border-emerald-900/50 text-emerald-500 text-[9px] uppercase tracking-widest font-bold rounded-sm mt-1">Completed</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-950/30 border border-amber-900/50 text-amber-500 text-[9px] uppercase tracking-widest font-bold rounded-sm mt-1">Active</span>
                          )}
                          {customer.serviceType && (
                            <span className="px-2 py-0.5 bg-accent/20 border border-accent/30 text-accent text-[9px] uppercase tracking-widest font-bold rounded-sm mt-1">
                              {customer.serviceType}
                            </span>
                          )}
                          {customer.assignedTo && customer.assignedTo !== 'Unassigned' && (
                            <span className="px-2 py-0.5 bg-surface border border-border text-text-secondary text-[9px] uppercase tracking-widest font-bold rounded-sm mt-1">
                              {customer.assignedTo}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <Clock className="w-3.5 h-3.5 text-accent" />
                            {format(new Date(customer.appointmentTime), 'MMM dd, yyyy h:mm a')}
                          </span>
                          <span className="flex items-center gap-1.5 line-clamp-1 break-all">
                            <MapPin className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                            {customer.address}
                          </span>
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <Phone className="w-3.5 h-3.5 text-accent" />
                            {customer.phone}
                          </span>
                        </div>
                      </div>

                        {/* Specs */}
                        <div className="flex items-center gap-3 bg-surface px-4 py-2 rounded-sm border border-border self-start sm:self-center">
                          <div className="text-center px-2">
                            <p className="text-[9px] text-text-secondary uppercase tracking-widest mb-0.5">Win</p>
                            <p className="font-serif text-text-primary italic">{customer.windowCount}</p>
                          </div>
                          <div className="w-px h-6 bg-border" />
                          <div className="text-center px-2">
                            <p className="text-[9px] text-text-secondary uppercase tracking-widest mb-0.5">AGL</p>
                            <p className="font-serif text-text-primary italic">{customer.aglCount}</p>
                          </div>
                          {customer.mileageAttributed && (
                            <>
                              <div className="w-px h-6 bg-border" />
                              <div className="text-center px-2">
                                <p className="text-[9px] text-emerald-400 uppercase tracking-widest mb-0.5">Odo</p>
                                <p className="font-serif text-emerald-300 italic">{customer.mileageAttributed}</p>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Actions */}
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <div className="flex items-center gap-1.5 border border-border bg-surface p-1 rounded-sm">
                          {deletingId === customer.id ? (
                            <div className="flex items-center gap-1 h-8">
                              <button 
                                onClick={() => handleDeleteClient(customer.id)}
                                className="px-2 text-[10px] font-bold text-red-500 hover:text-white uppercase tracking-widest transition-colors h-full"
                              >
                                Confirm
                              </button>
                              <button 
                                onClick={() => setDeletingId(null)}
                                className="px-1 text-text-secondary hover:text-white h-full"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeletingId(customer.id)}
                              className="p-1.5 text-red-500/50 hover:text-red-500 hover:bg-bg rounded-sm transition-all h-8 w-8 flex items-center justify-center cursor-pointer"
                              title="Delete Customer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="w-px h-4 bg-border mx-1" />
                          <button 
                            onClick={() => handleEditClick(customer)}
                            className="p-1.5 text-text-secondary hover:text-accent hover:bg-bg rounded-sm transition-all h-8 w-8 flex items-center justify-center cursor-pointer"
                            title="Edit Customer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <a 
                            href={`tel:${customer.phone}`}
                            className="p-1.5 text-text-secondary hover:text-accent hover:bg-bg rounded-sm transition-all h-8 w-8 flex items-center justify-center cursor-pointer"
                            title="Call Customer"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          <button 
                            onClick={() => setHistoryModalCustomerId(customer.id)}
                            className="p-1.5 text-text-secondary hover:text-accent hover:bg-bg rounded-sm transition-all h-8 w-8 flex items-center justify-center cursor-pointer"
                            title="View/Add Service Logs"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
              ))}
              
              {customers.length === 0 && (
                <div className="text-center py-24 bg-surface/30 rounded-sm border border-border border-dashed">
                  <Users className="w-12 h-12 text-border mx-auto mb-4" />
                  <p className="label-caps">Directory is empty</p>
                </div>
              )}
            </div>
          </>
        )}

        {currentRoute === 'help' && (
          <div className="max-w-xl mx-auto space-y-12 pb-16">
            <div>
              <h2 className="text-3xl font-serif text-text-primary mb-2">Training Manual</h2>
              <p className="label-caps italic">Interactive App Guide</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-serif text-accent pb-2 border-b border-border">1. The Dashboard Card</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                This is what your jobs look like when they are scheduled. Here is a breakdown of what the buttons do.
              </p>

              <div className="luxury-card p-6 relative border-dashed border-2 border-border mt-16 shadow-2xl">
                {/* Mock Card Header */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-serif text-text-primary tracking-wide mb-3">John Doe</h3>
                    <div className="flex gap-4 text-text-secondary text-sm">
                        <span className="flex items-center gap-1 label-caps"><Clock className="w-3" /> 9:00 AM</span>
                    </div>
                  </div>
                  
                  {/* Mock Action Icons */}
                  <div className="flex items-center gap-2 relative">
                    {/* Tooltip for History */}
                    <div className="absolute -top-14 left-0 w-max bg-surface border border-accent/40 text-text-primary text-[10px] uppercase font-bold tracking-widest px-3 py-2 rounded-sm shadow-xl z-20">
                      View/Add Service Log
                      <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-surface border-b border-r border-accent/40 rotate-45" />
                    </div>
                    <button className="p-3 bg-bg border border-border rounded-sm text-text-secondary relative z-10">
                      <ClipboardList className="w-4 h-4" />
                    </button>

                    {/* Tooltip for Edit */}
                    <div className="absolute -top-14 -right-4 w-max bg-surface border border-accent/40 text-text-primary text-[10px] uppercase font-bold tracking-widest px-3 py-2 rounded-sm shadow-xl z-20">
                      Reschedule/Edit Job
                      <div className="absolute -bottom-1.5 right-8 w-3 h-3 bg-surface border-b border-r border-accent/40 rotate-45" />
                    </div>
                    <button className="p-3 bg-bg border border-border rounded-sm text-text-secondary relative z-10">
                      <Pencil className="w-4 h-4" />
                    </button>
                    
                    <button className="p-3 bg-bg border border-border rounded-sm text-text-secondary relative z-10 opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-4 relative mt-16">
                    {/* Tooltip for Mark Complete */}
                    <div className="absolute -top-14 right-0 w-max bg-accent text-bg text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-sm shadow-[0_0_15px_rgba(235,190,131,0.3)] z-20">
                      Finishes job & moves to History
                      <div className="absolute -bottom-1 right-12 w-3 h-3 bg-accent rotate-45" />
                    </div>

                    <button className="btn-luxury-outline flex-1 flex items-center justify-center gap-2 opacity-30"><Navigation className="w-4 h-4" /> Launch Map</button>
                    <button className="btn-luxury-outline flex-1 flex items-center justify-center gap-2 opacity-30"><Calendar className="w-4 h-4" /> View Event</button>
                    <button className="btn-luxury-outline flex-1 flex items-center justify-center gap-2 border-accent text-accent relative z-10"><CheckCircle2 className="w-4 h-4" /> Mark Complete</button>
                </div>

                {/* Quick actions row mockup */}
                <div className="flex items-center gap-2 pt-4 border-t border-border mt-16 relative overflow-visible">
                    {/* Tooltip for Arrival Odo */}
                    <div className="absolute -top-14 left-0 w-max bg-emerald-500 text-bg text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-sm shadow-[0_0_15px_rgba(16,185,129,0.3)] z-30">
                      Tap when you arrive to log route cost
                      <div className="absolute -bottom-1 left-8 w-3 h-3 bg-emerald-500 rotate-45" />
                    </div>

                    <button className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-emerald-950/20 border border-emerald-500 text-emerald-400 rounded-sm font-bold text-xs relative z-20 shadow-[0_0_10px_rgba(16,185,129,0.2)]"><Navigation className="w-4 h-4" /> ARR. ODO</button>
                    <button className="flex-1 p-2.5 bg-surface border border-border rounded-sm text-text-secondary text-xs font-bold text-center opacity-50">CALL</button>
                    <button className="flex-1 p-2.5 bg-surface border border-border rounded-sm text-text-secondary text-xs font-bold text-center opacity-50">MAP</button>
                    <button className="flex-1 p-2.5 bg-surface border border-border rounded-sm text-text-secondary text-xs font-bold text-center opacity-50">LOG</button>
                    <button className="flex-1 p-2.5 bg-surface border border-border rounded-sm text-text-secondary text-xs font-bold text-center opacity-50">PRINT</button>
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-8 border-t border-border">
              <h3 className="text-xl font-serif text-accent pb-2 border-b border-border">2. Mileage Tracker Rules</h3>
              <ul className="space-y-6 text-sm text-text-secondary leading-relaxed">
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center font-serif text-text-primary">1</div>
                    <div>
                      <strong className="text-text-primary block mb-1">Start Route</strong>
                      Hit the green "Start Route" button at the very top of your dashboard. Enter your starting truck odometer. Do this before your first drive.
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-950/30 border border-emerald-900/50 flex items-center justify-center font-serif text-emerald-400">2</div>
                    <div>
                      <strong className="text-emerald-400 block mb-1">Arrival Odometer (ARR. ODO)</strong>
                      When you pull up to your first client's house, tap the green <em>"ARR. ODO"</em> button at the bottom of their specific job card (shown in the diagram above). Put in your current truck odometer. The app will subtract the numbers and tag that mileage cost to their profile.
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center font-serif text-text-primary">3</div>
                    <div>
                      <strong className="text-text-primary block mb-1">Next Job</strong>
                      Drive to your next job. When you park, tap the next client's <em>"ARR ODO"</em> button. It will calculate the mileage between the last stop and this one, tagging the cost to this new client.
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-950/30 border border-red-900/50 flex items-center justify-center font-serif text-red-500">4</div>
                    <div>
                      <strong className="text-red-400 block mb-1">End Route</strong>
                      At the very end of the day, when you are done driving, tap the pulsing red "End Route" button at the top of your dashboard to close out your day.
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-serif text-accent">5</div>
                    <div>
                      <strong className="text-accent block mb-1">Export your Taxes</strong>
                      When tax season comes, navigate to the <em>Job History</em> tab and tap "Export Mileage CSV" to download the whole spreadsheet for your accountant.
                    </div>
                  </li>
              </ul>
            </div>

            <div className="space-y-6 pt-8 border-t border-border mb-12">
              <h3 className="text-xl font-serif text-accent pb-2 border-b border-border">3. Directory & Search</h3>
              <p className="text-sm text-text-secondary leading-relaxed bg-surface p-6 rounded-sm border border-border">
                  The <strong>Directory</strong> tab contains every person in your database alphabetically. Active or Completed. If a client calls you out of the blue, go to the Directory tab and use the Search bar to instantly pull them up. Click the Pencil icon to give them a new appointment date, hit save, and they will pop right back onto your active dashboard for that day!
              </p>
            </div>
          </div>
        )}

        {currentRoute === 'team' && (
          <div className="max-w-xl mx-auto pb-16">
            <div className="mb-10">
              <h2 className="text-3xl font-serif text-text-primary mb-2">Team Management</h2>
              <p className="text-sm text-text-secondary">Manage the employees and teams available for job assignments.</p>
            </div>

            <div className="luxury-card p-8 mb-10">
              <h3 className="text-lg font-serif text-text-primary tracking-wide mb-6">Add Team Member</h3>
              <form onSubmit={handleAddEmployee} className="flex gap-4">
                <input 
                  type="text"
                  required
                  placeholder="e.g. John Smith or 'Team Alpha'"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  className="input-luxury flex-1"
                />
                <button 
                  type="submit"
                  disabled={isAddingEmployee}
                  className="btn-luxury-primary flex items-center justify-center gap-2 px-6 whitespace-nowrap disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-serif text-text-primary tracking-wide mb-6 border-b border-border pb-2">Active Team Directory</h3>
              {employees.length === 0 ? (
                <div className="text-center py-16 bg-surface/30 rounded-sm border border-border border-dashed">
                  <UserIcon className="w-8 h-8 text-border mx-auto mb-3" />
                  <p className="label-caps mb-1">No custom team members added yet.</p>
                  <p className="text-xs text-text-secondary mx-auto max-w-xs leading-relaxed">
                    Add a name above to make them available in the "Assigned Employee" dropdown on intake forms.
                  </p>
                </div>
              ) : (
                employees.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between p-4 bg-surface border border-border rounded-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex flex-shrink-0 items-center justify-center text-accent">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="font-serif text-text-primary text-lg">{emp.name}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                      className="p-2 text-red-500/50 hover:text-red-500 hover:bg-bg rounded-sm transition-all"
                      title="Remove Member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Map Assistant Floating Button */}
      <div className="fixed bottom-8 right-8 z-40 flex flex-col items-end gap-4 overflow-visible">
        <AnimatePresence>
          {isAssistantOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-80 sm:w-96 h-[500px] bg-surface rounded-sm border border-border shadow-2xl flex flex-col overflow-hidden mb-4"
            >
              <div className="p-4 border-b border-border bg-bg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-accent/20 rounded-sm">
                    <Sparkles className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-text-primary">Map Assistant</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-tighter">AI Online</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsAssistantOpen(false)} className="text-text-secondary hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[radial-gradient(circle_at_bottom_right,var(--color-bg)_0%,transparent_100%)]">
                {assistantMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-3 rounded-sm text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-accent text-bg font-medium' 
                        : 'bg-bg/80 border border-border text-text-primary shadow-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isAssistantLoading && (
                  <div className="flex justify-start">
                    <div className="bg-bg/80 border border-border text-text-secondary p-3 rounded-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                      <span className="text-xs italic uppercase tracking-wider font-bold">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-border bg-bg">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleAssistantSend(); }}
                  className="flex gap-2"
                >
                  <input 
                    type="text"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    placeholder="Ask about your route..."
                    className="flex-1 bg-surface border border-border rounded-sm px-4 py-2 text-sm text-text-primary outline-none focus:border-accent/40 placeholder:text-text-secondary/50"
                  />
                  <button 
                    type="submit"
                    disabled={isAssistantLoading || !assistantInput.trim()}
                    className="p-2 bg-accent text-bg rounded-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setIsAssistantOpen(!isAssistantOpen)}
          className={`flex items-center gap-3 p-4 rounded-full shadow-2xl transition-all duration-300 group ${
            isAssistantOpen 
              ? 'bg-surface border border-border text-accent scale-90' 
              : 'bg-accent text-bg hover:scale-110 active:scale-95'
          }`}
        >
          <div className="relative">
            <Sparkles className={`w-6 h-6 ${!isAssistantOpen && 'animate-pulse'}`} />
            {!isAssistantOpen && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-accent" />
            )}
          </div>
          {!isAssistantOpen && (
            <motion.span 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-bold uppercase tracking-[0.2em] text-[10px] pr-2"
            >
              Map Assistant
            </motion.span>
          )}
        </button>
      </div>

      {/* Add Form Overlay */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddForm(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-bg border-t sm:border border-border p-10 sm:rounded-sm overflow-y-auto max-h-[95vh] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center justify-between mb-10 border-b border-border pb-6">
                <h3 className="text-2xl font-serif text-text-primary tracking-wider uppercase">
                  {editingId ? 'Edit Intake' : 'New Intake'}
                </h3>
                <button onClick={() => setShowAddForm(false)} className="p-3 bg-surface border border-border rounded-full text-text-secondary hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {formError && (
                <div className="mb-8 p-4 bg-red-950/40 border border-red-900/50 rounded-sm">
                  <p className="text-sm font-serif text-red-200">{formError}</p>
                </div>
              )}

              {syncError && (
                <div className="mb-8 p-4 bg-red-950/40 border border-red-900/50 rounded-sm">
                  <p className="text-sm font-serif text-red-200">{syncError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="field-group">
                    <label className="label-caps block mb-3">Customer Name</label>
                    <input 
                      required
                      className="input-luxury"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g. Julianne Sterling"
                    />
                  </div>
                  <div className="field-group">
                    <label className="label-caps block mb-3">Phone Number</label>
                    <input 
                      required
                      className="input-luxury"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="+1 (555) 012-9483"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label-caps block mb-3">Service Address</label>
                    <input 
                      required
                      className="input-luxury"
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                      placeholder="452 Oakwood Drive, Austin, TX"
                    />
                  </div>
                  <div className="field-group">
                    <label className="label-caps block mb-3">Service Type</label>
                    <div className="relative">
                      <select
                        className="input-luxury w-full appearance-none pr-10"
                        value={formData.serviceType}
                        onChange={e => setFormData({...formData, serviceType: e.target.value})}
                      >
                        <option value="Window Cleaning">Window Cleaning</option>
                        <option value="Gutter Cleaning">Gutter Cleaning</option>
                        <option value="Power Washing">Power Washing</option>
                        <option value="Solar Panel Cleaning">Solar Panel Cleaning</option>
                        <option value="Screen Repair">Screen Repair</option>
                        <option value="Other">Other</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-text-secondary">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="label-caps block mb-3">Assigned Employee</label>
                    <div className="relative">
                      <select
                        className="input-luxury w-full appearance-none pr-10"
                        value={formData.assignedTo}
                        onChange={e => setFormData({...formData, assignedTo: e.target.value})}
                      >
                        <option value="Unassigned">Unassigned</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.name}>{emp.name}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-text-secondary">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-border border border-border">
                    <div className="bg-bg p-4 flex flex-col">
                      <label className="label-caps mb-2 text-center">Windows</label>
                      <input 
                        type="number"
                        placeholder="0"
                        className="bg-transparent text-center text-xl font-serif text-text-primary outline-none placeholder:text-text-secondary/30"
                        value={formData.windowCount}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({...formData, windowCount: val === '' ? '' : parseInt(val, 10)});
                        }}
                      />
                    </div>
                    <div className="bg-bg p-4 flex flex-col">
                      <label className="label-caps mb-2 text-center">AGL Levels</label>
                      <input 
                        type="number"
                        placeholder="0"
                        className="bg-transparent text-center text-xl font-serif text-text-primary outline-none placeholder:text-text-secondary/30"
                        value={formData.aglCount}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({...formData, aglCount: val === '' ? '' : parseInt(val, 10)});
                        }}
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="label-caps block mb-3">Target Date & Time</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                      {/* Date part */}
                      <input 
                        type="date"
                        required
                        className="input-luxury flex-1"
                        value={formData.apptDate}
                        onChange={e => setFormData({...formData, apptDate: e.target.value})}
                      />
                      {/* Time part */}
                      <div className="flex items-center justify-between gap-2 bg-transparent border border-border rounded-sm px-3 py-2 flex-shrink-0 focus-within:border-accent transition-colors">
                        <div className="flex items-center gap-1">
                          <input
                             type="text"
                             maxLength={2}
                             placeholder="00"
                             className="w-8 text-center bg-transparent text-text-primary outline-none font-serif placeholder:text-text-secondary/30 focus:text-accent"
                             value={formData.apptHour}
                             onChange={e => setFormData({...formData, apptHour: e.target.value.replace(/[^0-9]/g, '')})}
                          />
                          <span className="text-text-secondary font-serif">:</span>
                          <input
                             type="text"
                             maxLength={2}
                             placeholder="00"
                             className="w-8 text-center bg-transparent text-text-primary outline-none font-serif placeholder:text-text-secondary/30 focus:text-accent"
                             value={formData.apptMinute}
                             onChange={e => setFormData({...formData, apptMinute: e.target.value.replace(/[^0-9]/g, '')})}
                          />
                        </div>
                        <button
                           type="button"
                           className="px-2 py-1 bg-surface border border-border text-xs font-bold text-accent rounded hover:bg-surface/80 transition-colors"
                           onClick={() => setFormData({...formData, apptAmPm: formData.apptAmPm === 'AM' ? 'PM' : 'AM'})}
                        >
                           {formData.apptAmPm}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label-caps block mb-3">Special Instructions</label>
                    <textarea 
                      className="input-luxury min-h-[120px] resize-none"
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      placeholder="Security codes, delicate surfaces, pet warnings..."
                    />
                  </div>
                </div>

                <div className="pt-8 flex flex-col gap-4">
                  <button 
                    type="submit"
                    disabled={isSyncing}
                    className="btn-luxury-primary w-full flex items-center justify-center gap-3 disabled:opacity-75 disabled:cursor-wait"
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        Saving & Syncing {syncAttempt > 1 ? `(Attempt ${syncAttempt}/3)...` : '...'}
                      </>
                    ) : (
                      'Save & Sync Calendar'
                    )}
                  </button>
                  {googleTokens ? (
                    <p className="text-[9px] text-center text-accent/50 uppercase font-bold tracking-[0.3em]">
                      Automatic Relational Sync Active
                    </p>
                  ) : (
                    <button 
                      type="button"
                      onClick={handleConnectCalendar}
                      className="text-[10px] text-text-secondary/60 hover:text-accent font-bold uppercase tracking-widest text-center transition-colors"
                    >
                      Establish Calendar Link for Auto-Sync
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Service History Modal Overlay */}
      <AnimatePresence>
        {activeHistoryCustomer && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryModalCustomerId(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-bg border-t sm:border border-border p-8 sm:p-10 sm:rounded-sm overflow-y-auto max-h-[95vh] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
                <div>
                  <h3 className="text-2xl font-serif text-text-primary tracking-wider uppercase">Service Log</h3>
                  <p className="text-sm text-text-secondary mt-1">{activeHistoryCustomer.name}</p>
                </div>
                <button onClick={() => setHistoryModalCustomerId(null)} className="p-3 bg-surface border border-border rounded-full text-text-secondary hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Form to add new log */}
              <form onSubmit={handleLogSubmit} className="mb-10 bg-surface p-6 border border-border rounded-sm">
                <h4 className="label-caps mb-4 text-text-primary">Add New Record</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="label-caps block mb-2">Service Date</label>
                    <input 
                      type="date" 
                      required 
                      value={logFormData.date} 
                      onChange={e => setLogFormData({...logFormData, date: e.target.value})} 
                      className="w-full bg-bg border border-border rounded-sm px-4 py-2.5 text-text-primary outline-none focus:border-accent transition-all text-sm" 
                    />
                  </div>
                  <div>
                    <label className="label-caps block mb-2">Service Type</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Window Cleaning" 
                      value={logFormData.type} 
                      onChange={e => setLogFormData({...logFormData, type: e.target.value})} 
                      className="w-full bg-bg border border-border rounded-sm px-4 py-2.5 text-text-primary outline-none focus:border-accent transition-all text-sm placeholder:text-text-secondary/50" 
                    />
                  </div>
                </div>
                <div className="mb-6">
                  <label className="label-caps block mb-2">Relevant Notes</label>
                  <textarea 
                    rows={2} 
                    placeholder="Job details, chemical mixtures used, client feedback..." 
                    value={logFormData.notes} 
                    onChange={e => setLogFormData({...logFormData, notes: e.target.value})} 
                    className="w-full bg-bg border border-border rounded-sm px-4 py-3 text-text-primary outline-none focus:border-accent transition-all text-sm resize-none placeholder:text-text-secondary/50" 
                  />
                </div>
                <button type="submit" className="w-full btn-luxury-primary py-3 flex justify-center gap-2 items-center">
                  <ClipboardList className="w-4 h-4" />
                  Save Record
                </button>
              </form>

              {/* List of existing logs */}
              <div className="space-y-4">
                <h4 className="label-caps text-text-secondary border-b border-border pb-2 mb-4">
                  Previous Services ({activeHistoryCustomer.serviceLogs?.length || 0})
                </h4>
                {activeHistoryCustomer.serviceLogs?.map(log => (
                  <div key={log.id} className="p-5 bg-surface border border-border rounded-sm hover:-translate-y-0.5 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-serif text-lg text-text-primary">{log.type}</span>
                      <span className="text-xs font-bold tracking-widest text-text-secondary px-2 py-1 bg-bg rounded-sm border border-border">
                        {format(new Date(log.date + 'T12:00:00'), 'MMM dd, yyyy')}
                      </span>
                    </div>
                    {log.notes && (
                      <div className="flex items-start gap-2 mt-2 pt-3 border-t border-border/50">
                        <FileText className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-text-primary/90 leading-relaxed font-serif">{log.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
                {(!activeHistoryCustomer.serviceLogs || activeHistoryCustomer.serviceLogs.length === 0) && (
                  <div className="text-center py-12 bg-bg/50 rounded-sm border border-border border-dashed">
                    <History className="w-8 h-8 text-border mx-auto mb-3" />
                    <p className="label-caps text-text-secondary/70">No service history recorded yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Setup Context Modal */}
      <AnimatePresence>
        {printSelectOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPrintSelectOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md bg-bg border-t sm:border border-border p-10 sm:rounded-sm shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              <h3 className="text-2xl font-serif text-text-primary tracking-wider uppercase mb-8 pb-4 border-b border-border">Print Day Schedule</h3>
              <div className="mb-8">
                <label className="label-caps block mb-3 text-text-primary">Select Print Target Date</label>
                <input 
                  type="date"
                  required
                  className="input-luxury [color-scheme:dark] w-full"
                  value={printDate}
                  onChange={e => setPrintDate(e.target.value)}
                />
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setIsPrinting(true);
                    setPrintSelectOpen(false);
                    setTimeout(() => window.print(), 800);
                  }}
                  className="btn-luxury-primary flex-1 flex justify-center items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Generate Print 
                </button>
                <button 
                  onClick={() => setPrintSelectOpen(false)}
                  className="btn-luxury-outline px-6"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Route Tracking Modals */}
      <AnimatePresence>
        {showRouteModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center sm:p-6 p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRouteModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="relative w-full max-w-sm bg-bg border border-border p-8 rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
              <h3 className="text-xl font-serif text-text-primary tracking-wider uppercase mb-6 text-center">
                {showRouteModal === 'start' ? 'Start Shift' : 'End Shift'}
              </h3>
              <form onSubmit={showRouteModal === 'start' ? handleStartRoute : handleEndRoute}>
                <div className="mb-6 text-center">
                  <label className="label-caps block mb-4 text-text-secondary">Enter Current Odometer</label>
                  <input 
                    type="number"
                    required
                    value={odometerInput}
                    onChange={e => setOdometerInput(e.target.value)}
                    className="w-full bg-surface border border-border rounded-sm px-4 py-4 text-text-primary outline-none focus:border-accent text-3xl font-serif text-center"
                    placeholder="124500"
                  />
                  {showRouteModal === 'end' && activeRoute && (
                    <p className="text-xs text-text-secondary mt-4 font-mono">
                      Started at: {activeRoute.startOdometer}
                    </p>
                  )}
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowRouteModal(null)} className="btn-luxury-outline flex-1">Cancel</button>
                  <button type="submit" className="btn-luxury-primary flex-1">Submit</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showJobMileageModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center sm:p-6 p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJobMileageModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="relative w-full max-w-sm bg-bg border border-border p-8 rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
              <h3 className="text-xl font-serif text-text-primary tracking-wider uppercase mb-6 text-center">Arrival Odometer</h3>
              <form onSubmit={calculateJobMileage}>
                <div className="mb-6 text-center">
                  <label className="label-caps block mb-4 text-text-secondary">Tag Cost of Service</label>
                  <input 
                    type="number"
                    required
                    value={odometerInput}
                    onChange={e => setOdometerInput(e.target.value)}
                    className="w-full bg-surface border border-border rounded-sm px-4 py-4 text-text-primary outline-none focus:border-emerald-500/50 text-3xl font-serif text-center"
                    placeholder="124510"
                  />
                  {activeRoute && (
                    <p className="text-xs text-text-secondary mt-4 font-mono">
                      Last Checkpoint: {activeRoute.currentOdometer}
                    </p>
                  )}
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowJobMileageModal(null)} className="btn-luxury-outline flex-1">Cancel</button>
                  <button type="submit" className="flex-1 bg-emerald-950/40 border border-emerald-900 text-emerald-400 font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-emerald-900/60 transition-colors">Save Cost</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
