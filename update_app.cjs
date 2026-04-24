const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf-8');

const startStr = "{currentRoute === 'dashboard' ? (";
const endStr = "/* History View */";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end bounds.");
  process.exit(1);
}

const before = content.substring(0, startIndex);
const after = content.substring(endIndex);

const newDashboard = `{currentRoute === 'dashboard' ? (
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
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-serif text-text-primary">{format(currentMonth, 'MMMM yyyy')}</h3>
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
                          className={\`min-h-[5rem] sm:min-h-[7rem] bg-surface p-1 sm:p-2 flex flex-col cursor-pointer transition-colors border-b border-r border-border hover:bg-bg
                            \${!isCurM ? 'opacity-30' : ''}
                            \${isSel ? 'bg-accent/10 border-accent/40' : ''}
                          \`}
                        >
                          <div className={\`text-right text-xs mb-1 font-bold \${isT ? 'text-accent' : 'text-text-secondary'} \${isSel ? 'text-accent' : ''}\`}>
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
        ) : (
          `;

fs.writeFileSync('src/App.tsx', before + newDashboard + after);
console.log("Replaced block successfully");
