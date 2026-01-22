import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Users, DollarSign, AlertTriangle, Star, Trophy, RefreshCw, Loader, Download, Copy, Check } from 'lucide-react';

const FPLOptimizer = () => {
  const [mode, setMode] = useState('normal');
  const [budget, setBudget] = useState(100.0);
  const [freeTransfers, setFreeTransfers] = useState(1);
  const [gameweek, setGameweek] = useState(23);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeSet, setActiveSet] = useState(1);
  const [copied, setCopied] = useState(false);
  const [teamSets, setTeamSets] = useState({
    set1: { selected: [], starting: [], bench: [], captain: null, vice: null },
    set2: { selected: [], starting: [], bench: [], captain: null, vice: null },
    set3: { selected: [], starting: [], bench: [], captain: null, vice: null }
  });
  const [fplData, setFplData] = useState({
    players: [],
    currentGW: 1
  });

  // Fetch FPL data on component mount
  useEffect(() => {
    fetchFPLData();
  }, []);

  const fetchFPLData = async () => {
    try {
      setDataLoading(true);
      const response = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();

      const players = data.elements.map(player => {
        const team = data.teams.find(t => t.id === player.team)?.short_name || 'UNK';
        const positionMap = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
        
        return {
          id: player.id,
          name: `${player.first_name} ${player.second_name}`,
          team,
          position: positionMap[player.element_type],
          price: player.now_cost / 10,
          ppm: player.points_per_million || 0,
          minutes: player.minutes,
          prediction: Math.round((player.expected_goals || 0) + (player.expected_assists || 0) + (player.form || 0) * 2),
          yellowCards: player.yellow_cards || 0,
          form: parseFloat(player.form) || 0,
          fixture: 'Medium',
          selected: player.selected_by_percent || 0
        };
      });

      const currentEvent = data.events.find(e => e.is_current);
      
      setFplData({
        players: players.filter(p => p.price > 0),
        currentGW: currentEvent?.id || 1
      });
      setGameweek(currentEvent?.id || 1);
    } catch (error) {
      console.error('Error fetching FPL data:', error);
      alert('Unable to load FPL data. Please check your internet connection and try again.');
    } finally {
      setDataLoading(false);
    }
  };

  const optimizeTeam = () => {
    if (fplData.players.length === 0) {
      alert('กรุณารอโหลดข้อมูล FPL ก่อน');
      return;
    }

    setLoading(true);
    
    setTimeout(() => {
      const sets = {};
      
      // Set 1: Balanced
      sets.set1 = generateTeamSet([...fplData.players], 'premium');
      
      // Set 2: Value
      sets.set2 = generateTeamSet([...fplData.players], 'value');
      
      // Set 3: Aggressive
      sets.set3 = generateTeamSet([...fplData.players], 'aggressive');
      
      setTeamSets(sets);
      setLoading(false);
    }, 1500);
  };

  const generateTeamSet = (players, strategy) => {
    let optimized = [...players];
    
    // Sort based on strategy
    optimized.sort((a, b) => {
      let scoreA, scoreB;
      
      if (strategy === 'premium') {
        scoreA = (a.ppm * 0.3) + (a.prediction * 0.5) + (a.form * 2);
        scoreB = (b.ppm * 0.3) + (b.prediction * 0.5) + (b.form * 2);
      } else if (strategy === 'value') {
        scoreA = (a.ppm * 0.6) + (a.prediction * 0.3) + (a.form * 1);
        scoreB = (b.ppm * 0.6) + (b.prediction * 0.3) + (b.form * 1);
      } else {
        scoreA = (a.prediction * 0.7) + (a.form * 3) + (a.fixture === 'Easy' ? 15 : a.fixture === 'Medium' ? 5 : 0);
        scoreB = (b.prediction * 0.7) + (b.form * 3) + (b.fixture === 'Easy' ? 15 : b.fixture === 'Medium' ? 5 : 0);
      }
      
      return scoreB - scoreA;
    });

    let selected = [];
    let totalCost = 0;
    let positionCount = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    let teamCount = {};

    for (let player of optimized) {
      const maxByPosition = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
      const maxPerTeam = 3;

      if (positionCount[player.position] >= maxByPosition[player.position]) continue;
      if ((teamCount[player.team] || 0) >= maxPerTeam) continue;
      if (totalCost + player.price > budget) continue;

      selected.push(player);
      totalCost += player.price;
      positionCount[player.position]++;
      teamCount[player.team] = (teamCount[player.team] || 0) + 1;

      if (selected.length === 15) break;
    }

    // Optimize formation
    const gk = selected.filter(p => p.position === 'GKP').slice(0, 1);
    const allDef = selected.filter(p => p.position === 'DEF').sort((a, b) => b.prediction - a.prediction);
    const allMid = selected.filter(p => p.position === 'MID').sort((a, b) => b.prediction - a.prediction);
    const allFwd = selected.filter(p => p.position === 'FWD').sort((a, b) => b.prediction - a.prediction);

    const formations = [
      { def: 3, mid: 5, fwd: 2 },
      { def: 3, mid: 4, fwd: 3 },
      { def: 4, mid: 5, fwd: 1 },
      { def: 4, mid: 4, fwd: 2 },
      { def: 4, mid: 3, fwd: 3 },
      { def: 5, mid: 4, fwd: 1 },
      { def: 5, mid: 3, fwd: 2 }
    ];

    let bestFormation = null;
    let bestScore = 0;

    formations.forEach(form => {
      if (allDef.length >= form.def && allMid.length >= form.mid && allFwd.length >= form.fwd) {
        const def = allDef.slice(0, form.def);
        const mid = allMid.slice(0, form.mid);
        const fwd = allFwd.slice(0, form.fwd);
        const totalPred = [...def, ...mid, ...fwd].reduce((sum, p) => sum + p.prediction, 0);
        
        if (totalPred > bestScore) {
          bestScore = totalPred;
          bestFormation = { def, mid, fwd };
        }
      }
    });

    // Fallback if no formation found
    if (!bestFormation) {
      bestFormation = {
        def: allDef.slice(0, 4),
        mid: allMid.slice(0, 4),
        fwd: allFwd.slice(0, 1)
      };
    }

    const starting = [...gk, ...bestFormation.def, ...bestFormation.mid, ...bestFormation.fwd];
    const bench = selected.filter(p => !starting.includes(p))
      .sort((a, b) => {
        if (a.position === 'GKP') return 1;
        if (b.position === 'GKP') return -1;
        return b.prediction - a.prediction;
      });

    const captain = starting.reduce((max, p) => p.prediction > max.prediction ? p : max);
    const vice = starting.filter(p => p.id !== captain.id)
      .reduce((max, p) => p.prediction > max.prediction ? p : max);

    return { selected, starting, bench, captain, vice };
  };

  const getPositionColor = (pos) => {
    const colors = {
      GKP: 'bg-yellow-100 text-yellow-800',
      DEF: 'bg-blue-100 text-blue-800',
      MID: 'bg-green-100 text-green-800',
      FWD: 'bg-red-100 text-red-800'
    };
    return colors[pos] || 'bg-gray-100 text-gray-800';
  };

  const getSetStrategy = (setNum) => {
    const strategies = {
      1: { name: 'Balanced', desc: 'เน้น Premium + PPM สมดุล', color: 'from-purple-600 to-blue-600' },
      2: { name: 'Value', desc: 'เน้น Value Players คุ้มค่า', color: 'from-green-600 to-teal-600' },
      3: { name: 'Aggressive', desc: 'เน้น Form + Easy Fixtures', color: 'from-red-600 to-orange-600' }
    };
    return strategies[setNum];
  };

  const exportTeam = () => {
    const currentTeam = teamSets[`set${activeSet}`];
    const strategy = getSetStrategy(activeSet);
    
    let exportText = `🏆 FPL Team - Set ${activeSet}: ${strategy.name}\n`;
    exportText += `${strategy.desc}\n`;
    exportText += `Gameweek: ${gameweek}\n\n`;
    
    exportText += `👑 CAPTAIN: ${currentTeam.captain?.name} (${currentTeam.captain?.team})\n`;
    exportText += `⭐ VICE: ${currentTeam.vice?.name} (${currentTeam.vice?.team})\n\n`;
    
    exportText += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    exportText += `STARTING XI:\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
      const players = currentTeam.starting.filter(p => p.position === pos);
      if (players.length > 0) {
        exportText += `${pos}:\n`;
        players.forEach(p => {
          exportText += `  • ${p.name} (${p.team}) - £${p.price}M | Pred: ${p.prediction}pts\n`;
        });
        exportText += `\n`;
      }
    });
    
    exportText += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    exportText += `BENCH:\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    currentTeam.bench.forEach((p, i) => {
      exportText += `${i + 1}. ${p.name} (${p.team}) - ${p.position} - £${p.price}M\n`;
    });
    
    exportText += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    exportText += `SUMMARY:\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    const totalCost = currentTeam.selected.reduce((sum, p) => sum + p.price, 0);
    exportText += `Total Cost: £${totalCost.toFixed(1)}M\n`;
    exportText += `Budget Left: £${(budget - totalCost).toFixed(1)}M\n`;
    exportText += `Expected Points (8GW): ${currentTeam.selected.reduce((sum, p) => sum + p.prediction, 0)}pts\n`;
    exportText += `Yellow Card Warnings: ${currentTeam.selected.filter(p => p.yellowCards >= 4).length}\n`;
    
    return exportText;
  };

  const copyToClipboard = () => {
    const text = exportTeam();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadTeam = () => {
    const text = exportTeam();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FPL-Team-Set${activeSet}-GW${gameweek}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentSet = teamSets[`set${activeSet}`];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-purple-900 mb-2 flex items-center gap-2">
                <Trophy className="w-8 h-8" />
                FPL Team Optimizer - 3 Sets
              </h1>
              <p className="text-gray-600">สร้างทีมด้วย 3 กลยุทธ์ต่างกัน พร้อม Export!</p>
              <p className="text-sm text-purple-600 mt-1">
                ✅ {fplData.players.length} นักเตะพร้อมใช้งาน | GW {fplData.currentGW}
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
              <select 
                value={mode} 
                onChange={(e) => setMode(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="normal">Normal Transfer</option>
                <option value="freeHit">Free Hit</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Budget (£M)</label>
              <input 
                type="number" 
                value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value))}
                step="0.1"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Free Transfers</label>
              <input 
                type="number" 
                value={freeTransfers}
                onChange={(e) => setFreeTransfers(parseInt(e.target.value))}
                disabled={mode === 'freeHit'}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Gameweek</label>
              <input 
                type="number" 
                value={gameweek}
                onChange={(e) => setGameweek(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <button
            onClick={optimizeTeam}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                กำลังสร้าง 3 เซต...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Generate 3 Team Sets
              </>
            )}
          </button>
        </div>

        {/* Set Selector */}
        {currentSet.selected.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {[1, 2, 3].map((setNum) => {
                const strategy = getSetStrategy(setNum);
                const isActive = activeSet === setNum;
                return (
                  <button
                    key={setNum}
                    onClick={() => setActiveSet(setNum)}
                    className={`p-6 rounded-lg shadow-lg transition-all transform hover:scale-105 ${
                      isActive 
                        ? `bg-gradient-to-r ${strategy.color} text-white border-4 border-white shadow-2xl` 
                        : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className={`w-6 h-6 ${isActive ? 'fill-white' : 'fill-gray-400'}`} />
                      <h3 className="text-xl font-bold">Set {setNum}: {strategy.name}</h3>
                    </div>
                    <p className={`text-sm ${isActive ? 'text-white/90' : 'text-gray-600'}`}>
                      {strategy.desc}
                    </p>
                    {teamSets[`set${setNum}`].selected.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/20">
                        <p className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-700'}`}>
                          Expected: {teamSets[`set${setNum}`].selected.reduce((sum, p) => sum + p.prediction, 0)} pts
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Export Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <button
                onClick={copyToClipboard}
                className="bg-white border-2 border-purple-300 text-purple-700 py-3 rounded-lg font-semibold hover:bg-purple-50 transition flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy Team to Clipboard
                  </>
                )}
              </button>
              <button
                onClick={downloadTeam}
                className="bg-white border-2 border-blue-300 text-blue-700 py-3 rounded-lg font-semibold hover:bg-blue-50 transition flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download as Text File
              </button>
            </div>

            {/* Captain Picks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg shadow-lg p-6 border-2 border-yellow-400">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-6 h-6 text-yellow-600 fill-yellow-600" />
                  <h3 className="text-xl font-bold text-yellow-900">Captain</h3>
                </div>
                {currentSet.captain && (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-2xl font-bold text-gray-900">{currentSet.captain.name}</p>
                    <p className="text-gray-600">{currentSet.captain.team} • {currentSet.captain.position}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-green-600 font-semibold">Expected: {currentSet.captain.prediction} pts (8GW)</p>
                      <p className="text-xs text-gray-600">Form: {currentSet.captain.form} | £{currentSet.captain.price}M</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg shadow-lg p-6 border-2 border-gray-400">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-6 h-6 text-gray-600" />
                  <h3 className="text-xl font-bold text-gray-900">Vice Captain</h3>
                </div>
                {currentSet.vice && (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-2xl font-bold text-gray-900">{currentSet.vice.name}</p>
                    <p className="text-gray-600">{currentSet.vice.team} • {currentSet.vice.position}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-green-600 font-semibold">Expected: {currentSet.vice.prediction} pts (8GW)</p>
                      <p className="text-xs text-gray-600">Form: {currentSet.vice.form} | £{currentSet.vice.price}M</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Starting XI */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-bold text-purple-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                Starting XI - Set {activeSet}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentSet.starting.map((player) => (
                  <div key={player.id} className="border-2 border-purple-200 rounded-lg p-4 hover:shadow-lg transition">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-lg">{player.name}</p>
                        <p className="text-sm text-gray-600">{player.team}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPositionColor(player.position)}`}>
                        {player.position}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-semibold">£{player.price}M</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Form:</span>
                        <span className="font-semibold">{player.form}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">PPM:</span>
                        <span className="font-semibold">{player.ppm}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Prediction:</span>
                        <span className="font-semibold text-green-600">{player.prediction} pts</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fixture:</span>
                        <span className={`font-semibold text-xs ${
                          player.fixture === 'Easy' ? 'text-green-600' : 
                          player.fixture === 'Medium' ? 'text-yellow-600' : 'text-red-600'
                        }`}>{player.fixture}</span>
                      </div>
                      {player.yellowCards >= 4 && (
                        <div className="flex items-center gap-1 text-yellow-600 mt-2 pt-2 border-t">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-xs font-semibold">⚠️ {player.yellowCards} Yellows</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bench */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Bench (ตามลำดับ)</h2>
              <div className="space-y-3">
                {currentSet.bench.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{player.name}</p>
                      <p className="text-sm text-gray-600">{player.team} • {player.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">£{player.price}M</p>
                      <p className="text-xs text-gray-600">Form: {player.form}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className={`bg-gradient-to-r ${getSetStrategy(activeSet).color} rounded-lg shadow-lg p-6 text-white`}>
              <h3 className="text-xl font-bold mb-4">Set {activeSet} Summary - {getSetStrategy(activeSet).name}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-white/70 text-sm">Total Cost</p>
                  <p className="text-2xl font-bold">£{currentSet.selected.reduce((sum, p) => sum + p.price, 0).toFixed(1)}M</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">Budget Left</p>
                  <p className="text-2xl font-bold">£{(budget - currentSet.selected.reduce((sum, p) => sum + p.price, 0)).toFixed(1)}M</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">Expected (8GW)</p>
                  <p className="text-2xl font-bold">{currentSet.selected.reduce((sum, p) => sum + p.prediction, 0)}</p>
                </div>
                <div>
                  <p className="text-white/70 text-sm">Yellow Warnings</p>
                  <p className="text-2xl font-bold">{currentSet.selected.filter(p => p.yellowCards >= 4).length}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FPLOptimizer;