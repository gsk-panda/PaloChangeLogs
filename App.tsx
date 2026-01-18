import React, { useEffect, useState } from 'react';
import { useMsal, useIsAuthenticated, useAccount } from '@azure/msal-react';
import Sidebar from './components/Sidebar';
import ChangeLogTable from './components/ChangeLogTable';
import StatsChart from './components/StatsChart';
import { Bell, Calendar, AlertTriangle, RefreshCw, User, Award, Activity, Layers, ShieldCheck, Search, X, Lock, ScanSearch } from 'lucide-react';
import { ChangeRecord, DailyStat, AdminStat } from './types';
import { fetchChangeLogsRange, fetchAllChangeLogsRange, fetchLogDetail, parseDetailedXml, calculateDailyStatsInRange, calculateAdminStats } from './services/panoramaService';
import { searchChangeLogs, getDatabaseStats, getChangeLogsByDateRange } from './services/databaseService';
import { getTodayMST, extractDateFromTimestamp, addDaysToDateString } from './utils/dateUtils';
import { isOidcEnabled, loginRequest } from './authConfig';

const AppContent: React.FC = () => {
  const oidcEnabled = isOidcEnabled();
  const msal = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = useAccount(undefined);
  const [loginTrigger, setLoginTrigger] = useState(0);
  const [loggedInAccount, setLoggedInAccount] = useState<any>(null);
  
  const instance = oidcEnabled ? msal.instance : null;
  const effectiveIsAuthenticated = oidcEnabled ? isAuthenticated : true;
  
  const activeAccount = oidcEnabled && instance ? instance.getActiveAccount() : null;
  const accounts = oidcEnabled && instance ? instance.getAllAccounts() : [];
  const effectiveAccount = oidcEnabled ? (loggedInAccount || activeAccount || account || (accounts.length > 0 ? accounts[0] : null)) : null;
  const inProgress = oidcEnabled ? msal.inProgress : 'none';
  
  useEffect(() => {
    console.log('[Auth State] Component render - Auth state check');
    console.log('[Auth State] OIDC enabled:', oidcEnabled);
    console.log('[Auth State] isAuthenticated:', isAuthenticated);
    console.log('[Auth State] useAccount result:', account ? {
      name: account.name,
      username: account.username,
      homeAccountId: account.homeAccountId,
      localAccountId: account.localAccountId,
      hasIdTokenClaims: !!account.idTokenClaims,
      idTokenClaimsKeys: account.idTokenClaims ? Object.keys(account.idTokenClaims) : []
    } : 'null');
    console.log('[Auth State] getActiveAccount result:', activeAccount ? {
      name: activeAccount.name,
      username: activeAccount.username,
      homeAccountId: activeAccount.homeAccountId,
      localAccountId: activeAccount.localAccountId,
      hasIdTokenClaims: !!activeAccount.idTokenClaims,
      idTokenClaimsKeys: activeAccount.idTokenClaims ? Object.keys(activeAccount.idTokenClaims) : []
    } : 'null');
    console.log('[Auth State] effectiveAccount:', effectiveAccount ? {
      name: effectiveAccount.name,
      username: effectiveAccount.username,
      homeAccountId: effectiveAccount.homeAccountId,
      localAccountId: effectiveAccount.localAccountId,
      hasIdTokenClaims: !!effectiveAccount.idTokenClaims,
      idTokenClaimsKeys: effectiveAccount.idTokenClaims ? Object.keys(effectiveAccount.idTokenClaims) : []
    } : 'null');
    
    if (oidcEnabled && effectiveAccount) {
      console.log('[Auth] ✅ Account found - Full account object:', JSON.stringify(effectiveAccount, null, 2));
      console.log('[Auth] Account.name:', effectiveAccount.name);
      console.log('[Auth] Account.username:', effectiveAccount.username);
      console.log('[Auth] Account.idTokenClaims:', effectiveAccount.idTokenClaims);
      if (effectiveAccount.idTokenClaims) {
        console.log('[Auth] ID Token Claims - name:', effectiveAccount.idTokenClaims.name);
        console.log('[Auth] ID Token Claims - email:', effectiveAccount.idTokenClaims.email);
        console.log('[Auth] ID Token Claims - preferred_username:', effectiveAccount.idTokenClaims.preferred_username);
        console.log('[Auth] ID Token Claims - given_name:', effectiveAccount.idTokenClaims.given_name);
        console.log('[Auth] ID Token Claims - family_name:', effectiveAccount.idTokenClaims.family_name);
        console.log('[Auth] ID Token Claims - All keys:', Object.keys(effectiveAccount.idTokenClaims));
      }
    } else if (oidcEnabled) {
      console.warn('[Auth] ⚠️ No account found');
      console.warn('[Auth] isAuthenticated:', isAuthenticated);
      console.warn('[Auth] Active account:', activeAccount);
      console.warn('[Auth] useAccount result:', account);
      
      if (instance) {
        const allAccounts = instance.getAllAccounts();
        console.warn('[Auth] All accounts in cache:', allAccounts.length);
        allAccounts.forEach((acc, idx) => {
          console.warn(`[Auth] Account ${idx + 1}:`, {
            name: acc.name,
            username: acc.username,
            homeAccountId: acc.homeAccountId
          });
        });
      }
    }
  }, [oidcEnabled, effectiveAccount, isAuthenticated, activeAccount, account, instance, loginTrigger, accounts, inProgress]);

  useEffect(() => {
    if (oidcEnabled && inProgress === 'none' && accounts.length > 0 && instance) {
      const currentActive = instance.getActiveAccount();
      if (!currentActive && accounts.length > 0) {
        const firstAccount = accounts[0];
        console.log('[Auth] Login completed, setting active account from accounts array:', firstAccount ? {
          name: firstAccount.name,
          username: firstAccount.username
        } : 'null');
        instance.setActiveAccount(firstAccount);
        if (!loggedInAccount) {
          setLoggedInAccount(firstAccount);
        }
        setLoginTrigger(prev => prev + 1);
      } else if (currentActive && !loggedInAccount) {
        setLoggedInAccount(currentActive);
      }
    }
  }, [oidcEnabled, inProgress, accounts, activeAccount, instance, loggedInAccount]);

  const [allLogs, setAllLogs] = useState<ChangeRecord[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      return getTodayMST();
    } catch (e) {
      console.warn('Error initializing date:', e);
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  });
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<ChangeRecord[]>([]);
  const [dbStats, setDbStats] = useState<{ totalRows: number; dateRange: { min: string; max: string } | null } | null>(null);

  const loadData = async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const endDateStr = (() => {
        const [year, month, day] = targetDate.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return targetDate;
      })();
      const startDateStr = addDaysToDateString(endDateStr, -6);
      
      const today = getTodayMST();
      const isSelectedDateToday = endDateStr === today;
      const isSelectedDateHistorical = endDateStr < today;
      
      console.log(`[LoadData] Date comparison: selected=${endDateStr}, today=${today}, isToday=${isSelectedDateToday}, isHistorical=${isSelectedDateHistorical}`);
      
      let fetchedLogs: ChangeRecord[] = [];
      
      if (isSelectedDateToday) {
        console.log(`[LoadData] Selected date is TODAY (${endDateStr}), fetching today from Panorama and previous 6 days from database...`);
        const previous6DaysStart = addDaysToDateString(endDateStr, -6);
        const previous6DaysEnd = addDaysToDateString(endDateStr, -1);
        
        let todayLogs: ChangeRecord[] = [];
        let previousDaysLogs: ChangeRecord[] = [];
        
        try {
          console.log(`[LoadData] Fetching today's logs (${endDateStr}) from Panorama...`);
          todayLogs = await fetchAllChangeLogsRange(endDateStr, endDateStr);
          console.log(`[LoadData] Retrieved ${todayLogs.length} logs from Panorama for today`);
        } catch (err) {
          console.error('[LoadData] Panorama query for today failed:', err);
          throw err;
        }
        
        try {
          console.log(`[LoadData] Fetching previous 6 days (${previous6DaysStart} to ${previous6DaysEnd}) from database...`);
          previousDaysLogs = await getChangeLogsByDateRange(previous6DaysStart, previous6DaysEnd);
          console.log(`[LoadData] Retrieved ${previousDaysLogs.length} logs from database for previous 6 days`);
          
          if (previousDaysLogs.length === 0) {
            console.warn(`[LoadData] Database returned 0 logs for date range ${previous6DaysStart} to ${previous6DaysEnd}`);
            const stats = await getDatabaseStats();
            console.warn(`[LoadData] Database stats: ${stats.totalRows} total rows, date range: ${stats.dateRange?.min || 'N/A'} to ${stats.dateRange?.max || 'N/A'}`);
            console.warn(`[LoadData] Requested range: ${previous6DaysStart} to ${previous6DaysEnd}`);
            if (stats.dateRange) {
              const hasDataInRange = stats.dateRange.min <= previous6DaysEnd && stats.dateRange.max >= previous6DaysStart;
              console.warn(`[LoadData] Database has data in requested range: ${hasDataInRange}`);
            }
          }
        } catch (dbErr) {
          console.error('[LoadData] Database query for previous days failed:', dbErr);
          console.error('[LoadData] Error details:', dbErr instanceof Error ? dbErr.message : String(dbErr));
          console.error('[LoadData] Stack trace:', dbErr instanceof Error ? dbErr.stack : 'N/A');
          console.warn('[LoadData] Continuing with today\'s data only - previous 6 days will not be shown');
          previousDaysLogs = [];
        }
        
        fetchedLogs = [...todayLogs, ...previousDaysLogs];
        console.log(`[LoadData] Combined total: ${fetchedLogs.length} logs (${todayLogs.length} from today, ${previousDaysLogs.length} from previous 6 days)`);
      } else if (isSelectedDateHistorical) {
        console.log(`[LoadData] Selected date is HISTORICAL (${endDateStr} < ${today}), querying DATABASE for ${startDateStr} to ${endDateStr}...`);
        console.log(`[LoadData] Today is: ${today}, Selected date: ${endDateStr}, Comparison: ${endDateStr} < ${today} = ${isSelectedDateHistorical}`);
        try {
          fetchedLogs = await getChangeLogsByDateRange(startDateStr, endDateStr);
          console.log(`[LoadData] Retrieved ${fetchedLogs.length} logs from database`);
          if (fetchedLogs.length === 0) {
            console.warn('[LoadData] Database returned 0 logs. Checking database stats...');
            const stats = await getDatabaseStats();
            console.warn(`[LoadData] Database stats: ${stats.totalRows} total rows, date range: ${stats.dateRange?.min || 'N/A'} to ${stats.dateRange?.max || 'N/A'}`);
            console.warn('[LoadData] This might indicate the date has no data or database needs population');
          }
        } catch (dbErr) {
          console.error('[LoadData] Database query failed:', dbErr);
          console.error('[LoadData] Error details:', dbErr instanceof Error ? dbErr.message : String(dbErr));
          console.warn('[LoadData] Falling back to Panorama (this should not happen for historical dates)');
          fetchedLogs = await fetchChangeLogsRange(startDateStr, endDateStr);
        }
      } else {
        console.log(`[LoadData] Selected date is FUTURE (${endDateStr} > ${today}), querying Panorama for ${startDateStr} to ${endDateStr}...`);
        fetchedLogs = await fetchChangeLogsRange(startDateStr, endDateStr);
      }
      
      const filteredLogs = fetchedLogs.filter(log => {
        const hasDescription = log.description && log.description.trim().length > 0;
        return hasDescription;
      });
      
      console.log(`[LoadData] After filtering: ${filteredLogs.length} logs with descriptions out of ${fetchedLogs.length} total`);
      
      const dailyStats = calculateDailyStatsInRange(filteredLogs, endDateStr);
      const admins = calculateAdminStats(filteredLogs);
      
      console.log(`[LoadData] Calculated stats: ${dailyStats.length} days, ${admins.length} admins`);
      
      setAllLogs(fetchedLogs);
      setStats(dailyStats);
      setAdminStats(admins);
    } catch (err: any) {
      console.error("Failed to load data", err);
      setError(err.message || "Failed to connect to Panorama.");
    } finally {
      setLoading(false);
    }
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const today = getTodayMST();
      const yesterday = addDaysToDateString(today, -1);
      
      console.log(`[Search] Searching all available data for "${query}"...`);
      console.log(`[Search] Splitting search: historical data from database, today's data from Panorama...`);
      
      let historicalResults: ChangeRecord[] = [];
      let todayResults: ChangeRecord[] = [];
      
      console.log(`[Search] Querying DATABASE for all historical data (up to ${yesterday})...`);
      try {
        historicalResults = await searchChangeLogs(query);
        console.log(`[Search] Found ${historicalResults.length} matching logs in DATABASE`);
      } catch (dbErr) {
        console.error('[Search] DATABASE query failed for historical data:', dbErr);
        console.error('[Search] Error details:', dbErr instanceof Error ? dbErr.message : String(dbErr));
      }
      
      console.log(`[Search] Querying Panorama API for today's data: ${today}...`);
      const fetchedLogs = await fetchAllChangeLogsRange(today, today);
      const logsWithDescription = fetchedLogs.filter(log => 
        log.description && log.description.trim().length > 0
      );
      
      console.log(`Fetched ${logsWithDescription.length} logs from Panorama, getting full details...`);
      
      const logsWithFullDetails = await Promise.all(
        logsWithDescription.map(async (log) => {
          try {
            const xmlResult = await fetchLogDetail(log.seqno);
            const parsed = parseDetailedXml(xmlResult);
            
            return {
              ...log,
              diffBefore: parsed.before || log.diffBefore || 'No previous configuration state.',
              diffAfter: parsed.after || log.diffAfter || 'No new configuration state.',
            };
          } catch (err) {
            console.warn(`Failed to fetch details for seqno ${log.seqno}:`, err);
            return log;
          }
        })
      );
      
      const searchTerm = query.toLowerCase().trim();
      todayResults = logsWithFullDetails.filter(log => {
        const description = (log.description || '').toLowerCase();
        const admin = (log.admin || '').toLowerCase();
        const action = (log.action || '').toLowerCase();
        const type = (log.type || '').toLowerCase();
        const seqno = (log.seqno || '').toLowerCase();
        const diffAfter = (log.diffAfter || '').toLowerCase();
        const diffBefore = (log.diffBefore || '').toLowerCase();
        
        return description.includes(searchTerm) ||
               admin.includes(searchTerm) ||
               action.includes(searchTerm) ||
               type.includes(searchTerm) ||
               seqno.includes(searchTerm) ||
               diffAfter.includes(searchTerm) ||
               diffBefore.includes(searchTerm);
      });
      
      console.log(`Found ${todayResults.length} matching logs from Panorama for today`);
      const results = [...historicalResults, ...todayResults];
      
      console.log(`Total search results: ${results.length} matching logs`);
      setSearchResults(results);
    } catch (err: any) {
      console.error("Search failed", err);
      setError(err.message || "Search failed.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchClick = () => {
    if (oidcEnabled && !effectiveIsAuthenticated) {
      setError("Authentication required. Please log in.");
      return;
    }
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    } else {
      setSearchResults([]);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchClick();
    }
  };

  useEffect(() => {
    if (oidcEnabled && !effectiveIsAuthenticated) {
      console.log('[Auth] User not authenticated, clearing all data...');
      setAllLogs([]);
      setStats([]);
      setAdminStats([]);
      setSearchResults([]);
      setDbStats(null);
      setError(null);
      
      if (instance) {
        console.log('[Auth Login] Attempting login popup...');
        console.log('[Auth Login] Login request:', {
          scopes: loginRequest.scopes,
          authority: instance.getConfiguration().auth.authority
        });
        instance.loginPopup(loginRequest).then((response) => {
          console.log('[Auth Login] ✅ Login successful!');
          console.log('[Auth Login] Response:', {
            account: response.account ? {
              name: response.account.name,
              username: response.account.username,
              homeAccountId: response.account.homeAccountId,
              hasIdTokenClaims: !!response.account.idTokenClaims
            } : null,
            idToken: response.idToken ? response.idToken.substring(0, 50) + '...' : null,
            accessToken: response.accessToken ? response.accessToken.substring(0, 50) + '...' : null
          });
          if (response.account) {
            console.log('[Auth Login] Account ID Token Claims:', response.account.idTokenClaims);
          }
          instance.setActiveAccount(response.account);
          console.log('[Auth Login] Set active account:', response.account ? {
            name: response.account.name,
            username: response.account.username
          } : 'null');
          setLoggedInAccount(response.account);
          setLoginTrigger(prev => prev + 1);
        }).catch((e) => {
          console.error('[Auth Login] ❌ Login failed:', e);
          console.error('[Auth Login] Error details:', {
            message: e.message,
            errorCode: e.errorCode,
            errorMessage: e.errorMessage,
            stack: e.stack,
            name: e.name
          });
          setError("Authentication required. Please log in.");
        });
      }
      return;
    }
    
    if (!oidcEnabled || effectiveIsAuthenticated) {
      loadData(selectedDate);
      getDatabaseStats().then(stats => {
        setDbStats(stats);
        console.log(`[Database] Stats: ${stats.totalRows} total rows, date range: ${stats.dateRange?.min || 'N/A'} to ${stats.dateRange?.max || 'N/A'}`);
      }).catch(err => {
        console.warn('[Database] Failed to get stats:', err);
      });
    }
  }, [selectedDate, effectiveIsAuthenticated, oidcEnabled, instance]);

  const filteredLogs = allLogs.filter(log => {
    const hasDescription = log.description && log.description.trim().length > 0;
    return hasDescription;
  });

  const normalizedSelectedDate = (() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return selectedDate;
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } catch (e) {
      return selectedDate;
    }
  })();

  const tableLogs = searchQuery.trim() 
    ? searchResults 
    : filteredLogs.filter(log => {
        const logDateStr = extractDateFromTimestamp(log.timestamp);
        const matchesDate = logDateStr === normalizedSelectedDate;
        return matchesDate;
      });
  
  const changeCount = tableLogs.length;
  const totalWindowChanges = filteredLogs.length;
  
  const displayDateLabel = (() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }).format(date);
    } catch (e) {
      console.warn('Error formatting display date:', e);
      return selectedDate;
    }
  })();

  const handleDateSelect = (date: string) => {
    try {
      const [year, month, day] = date.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setSelectedDate(normalizedDate);
      } else {
        setSelectedDate(date);
      }
    } catch (e) {
      console.warn('Error normalizing selected date:', e);
      setSelectedDate(date);
    }
  };

  if (oidcEnabled && !effectiveIsAuthenticated) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 font-sans text-slate-200 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-slate-800">
            <div className="bg-white rounded-2xl p-6 mb-6 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                    <ScanSearch className="w-7 h-7 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">PanoVision</h1>
                  <div className="flex items-center gap-2 text-xs text-slate-600 font-medium mt-0.5">
                    <span>NETWORK</span>
                    <span className="text-slate-400">|</span>
                    <span>ANALYTICS</span>
                    <span className="text-slate-400">|</span>
                    <span>INSIGHT</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center mb-8">
              <p className="text-lg text-slate-300 font-medium">Panorama Change Log Database</p>
            </div>
            
            <div className="space-y-4">
              {instance && (
                <button
                  onClick={() => {
                    instance.loginPopup(loginRequest).catch((e) => {
                      console.error('[Auth Login] Login failed:', e);
                      setError("Authentication failed. Please try again.");
                    });
                  }}
                  className="w-full bg-white hover:bg-slate-50 text-slate-900 font-semibold py-4 px-6 rounded-xl shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Sign in with Entra ID
                </button>
              )}
              
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mt-6">
                <Lock size={16} />
                <span>Restricted Access / 2FA Required</span>
              </div>
              
              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 font-sans text-slate-200">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 h-16 flex items-center justify-end px-8 sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <button className="text-slate-500 hover:text-slate-300 relative transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full ring-2 ring-slate-900"></span>
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-800">
              <div className="text-right hidden md:block">
                <div className="text-sm font-semibold text-slate-300">
                  {oidcEnabled && effectiveAccount ? (
                    effectiveAccount.idTokenClaims?.name || 
                    effectiveAccount.name || 
                    effectiveAccount.idTokenClaims?.preferred_username ||
                    effectiveAccount.username || 
                    "User"
                  ) : "Guest User"}
                </div>
                <div className="text-xs text-slate-500">
                  {oidcEnabled && effectiveAccount ? (
                    (effectiveAccount.idTokenClaims?.email as string) ||
                    (effectiveAccount.idTokenClaims?.preferred_username as string) ||
                    effectiveAccount.username ||
                    "Security Admin"
                  ) : "Security Admin"}
                </div>
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-orange-500/20 to-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-xs shadow-sm">
                {oidcEnabled && effectiveAccount ? (
                  (effectiveAccount.idTokenClaims?.name || effectiveAccount.name || effectiveAccount.username || "U").charAt(0).toUpperCase()
                ) : "G"}
              </div>
              {oidcEnabled && effectiveIsAuthenticated && instance && (
                <button
                  onClick={() => {
                    console.log('[Auth] Logout initiated, clearing all data and session...');
                    setAllLogs([]);
                    setStats([]);
                    setAdminStats([]);
                    setSearchResults([]);
                    setDbStats(null);
                    setError(null);
                    setLoading(false);
                    setSearchQuery('');
                    setLoggedInAccount(null);
                    if (instance) {
                      instance.logoutPopup({
                        postLogoutRedirectUri: window.location.origin + window.location.pathname
                      }).then(() => {
                        console.log('[Auth] Logout successful, clearing session storage...');
                        sessionStorage.clear();
                        window.location.reload();
                      }).catch((e) => {
                        console.error('[Auth] Logout error:', e);
                        sessionStorage.clear();
                        window.location.reload();
                      });
                    }
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded transition-colors"
                  title="Logout"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-8 pb-12">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Security Dashboard</h1>
                <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
                  <Activity size={14} className="text-orange-500" />
                  Reviewing changes for <span className="font-medium text-slate-300">{displayDateLabel}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 shadow-sm hover:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/50 transition-all">
                    <Search size={16} className="text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Search After-change-detail (CHG, RITM, Tech...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleSearchKeyPress}
                        className="bg-transparent border-none outline-none focus:ring-0 text-slate-300 p-0 text-sm w-64 font-medium placeholder-slate-600"
                        disabled={isSearching}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title="Clear search"
                        disabled={isSearching}
                      >
                        <X size={14} />
                      </button>
                    )}
                 </div>
                 {searchQuery && (
                   <button
                     onClick={handleSearchClick}
                     disabled={isSearching || !searchQuery.trim()}
                     className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all"
                   >
                     {isSearching ? (
                       <>
                         <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                         <span>Searching...</span>
                       </>
                     ) : (
                       <>
                         <Search size={16} />
                         <span>Search</span>
                       </>
                     )}
                   </button>
                 )}
                 <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 shadow-sm hover:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/50 transition-all">
                   <Calendar size={16} className="text-slate-500" />
                   <input 
                       type="date" 
                       value={selectedDate}
                       onChange={(e) => handleDateSelect(e.target.value)}
                       className="bg-transparent border-none outline-none focus:ring-0 text-slate-300 p-0 text-sm cursor-pointer font-medium color-scheme-dark"
                       disabled={isSearching}
                   />
                 </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col gap-2 animate-fadeIn shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded-full">
                      <AlertTriangle className="text-red-400" size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-red-200">Connection Error</h3>
                      <p className="text-sm text-red-300/80 mt-0.5">{error}</p>
                    </div>
                  </div>
                  <button onClick={() => loadData(selectedDate)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-red-500/30 text-red-300 text-sm font-medium rounded-lg hover:bg-slate-800 hover:shadow-sm transition-all">
                    <RefreshCw size={14} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title={`Changes on ${displayDateLabel}`}
                value={changeCount.toString()} 
                trend={changeCount > 0 ? "Changes Detected" : "No Activity"} 
                trendUp={changeCount > 0} 
                icon={<Layers size={22} className="text-blue-400" />}
                colorClass="blue"
              />
              <StatCard 
                title="7-Day Total Activity" 
                value={totalWindowChanges.toString()} 
                trend="Past Week" 
                trendUp={true} 
                neutral
                icon={<Activity size={22} className="text-purple-400" />}
                colorClass="purple"
              />
              <StatCard 
                title="Active Admins (7 Days)" 
                value={adminStats.length.toString()} 
                trend="Contributors" 
                trendUp={true} 
                neutral
                icon={<ShieldCheck size={22} className="text-emerald-400" />}
                colorClass="emerald"
              />
            </div>

            {/* Main Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-black/20 border border-slate-800 lg:col-span-2 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-base font-bold text-white">Activity Timeline</h3>
                      <p className="text-xs text-slate-500 mt-1">Daily commit frequency over the last 7 days</p>
                    </div>
                    <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700/50">Last 7 Days</span>
                </div>
                <div className="flex-1 min-h-[250px]">
                  {loading ? (
                    <div className="h-full bg-slate-800/50 rounded-lg animate-pulse flex items-center justify-center text-slate-500 text-sm">Loading visualization...</div>
                  ) : (
                    <StatsChart 
                      data={stats} 
                      selectedDate={selectedDate}
                      onDateSelect={handleDateSelect}
                    />
                  )}
                </div>
                <p className="mt-4 text-[11px] text-slate-500 text-center flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> Selected Date
                  <span className="w-2 h-2 rounded-full bg-slate-700 ml-2"></span> Other Days
                </p>
              </div>
              
              <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-black/20 border border-slate-800 flex flex-col">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <Award size={20} className="text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Top Contributors</h3>
                      <p className="text-xs text-slate-500">Most active admins</p>
                    </div>
                </div>
                {loading ? (
                   <div className="space-y-4">
                     {[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse"></div>)}
                   </div>
                ) : adminStats.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-xs gap-2">
                      <User size={24} className="opacity-20" />
                      No admin data available
                    </div>
                ) : (
                    <div className="space-y-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                        {adminStats.slice(0, 10).map((stat, idx) => (
                            <div key={stat.admin} className="flex items-center justify-between group p-2 hover:bg-slate-800 rounded-lg transition-colors cursor-default">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                      idx === 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'
                                    }`}>
                                        {idx + 1}
                                    </div>
                                    <span className="text-sm font-medium text-slate-300 truncate max-w-[120px]" title={stat.admin}>{stat.admin}</span>
                                </div>
                                <span className="text-xs font-bold px-2.5 py-1 bg-slate-800 group-hover:bg-slate-700 border border-transparent group-hover:border-slate-600 text-slate-400 group-hover:text-slate-300 rounded-full transition-all">
                                    {stat.changes} <span className="text-[10px] font-normal text-slate-600 ml-0.5">edits</span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
              </div>
            </div>

            {/* Log Table for Selected Day */}
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-lg font-bold text-white">Change Log</h2>
                     <p className="text-slate-500 text-sm mt-0.5">
                       {searchQuery ? (
                         <>
                           Search results for "<span className="text-orange-400 font-medium">{searchQuery}</span>" 
                           <span className="ml-2 text-slate-600">• All available data</span>
                           {isSearching && <span className="ml-2 text-orange-400 animate-pulse">Searching...</span>}
                         </>
                       ) : (
                         <>Detailed records for {displayDateLabel}</>
                       )}
                     </p>
                   </div>
                   <div className="flex items-center gap-3">
                     {dbStats && (
                       <div className="text-xs font-medium px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-300 shadow-sm">
                         <span className="text-slate-400">Database:</span> <span className="font-bold text-orange-400">{dbStats.totalRows.toLocaleString()}</span> rows
                         {dbStats.dateRange && (
                           <span className="ml-2 text-slate-500">({dbStats.dateRange.min} to {dbStats.dateRange.max})</span>
                         )}
                       </div>
                     )}
                     <div className="text-xs font-medium px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-slate-400 shadow-sm">
                       {changeCount} {searchQuery ? 'found' : 'total'} {changeCount === 1 ? 'entry' : 'entries'}
                     </div>
                   </div>
               </div>
               {loading ? (
                 <div className="space-y-3">
                   {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-900 rounded-lg shadow-sm animate-pulse"></div>)}
                 </div>
               ) : (
                 <ChangeLogTable changes={tableLogs} />
               )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return <AppContent />;
};

const StatCard: React.FC<{ 
  title: string; 
  value: string; 
  trend: string; 
  trendUp: boolean; 
  neutral?: boolean;
  icon: React.ReactNode;
  colorClass: 'blue' | 'purple' | 'emerald';
}> = ({ title, value, trend, trendUp, neutral, icon, colorClass }) => {
  
  const bgColors = {
    blue: 'bg-blue-500/10',
    purple: 'bg-purple-500/10',
    emerald: 'bg-emerald-500/10'
  };

  return (
    <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-black/20 border border-slate-800 relative overflow-hidden group transition-all hover:-translate-y-0.5 hover:shadow-xl hover:border-slate-700">
      <div className={`absolute top-0 left-0 w-full h-1 ${
        colorClass === 'blue' ? 'bg-blue-500' : colorClass === 'purple' ? 'bg-purple-500' : 'bg-emerald-500'
      }`}></div>
      
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${bgColors[colorClass]}`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border border-transparent ${
          neutral ? 'bg-slate-800 text-slate-400 group-hover:border-slate-700' :
          trendUp ? 'bg-emerald-500/10 text-emerald-400 group-hover:border-emerald-500/20' : 'bg-red-500/10 text-red-400'
        }`}>
          {trend}
        </span>
      </div>
      
      <div>
        <h4 className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">{title}</h4>
        <span className="text-3xl font-bold text-white block tracking-tight">{value}</span>
      </div>
    </div>
  );
};

export default App;