import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { startOfWeek, format } from 'date-fns';
import DashboardCards from './components/DashboardCards';
import WeekNavigation from './components/WeekNavigation';
import EmployeeTable from './components/EmployeeTable';
import { supabase } from './lib/supabase';

function App() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRate, setNewEmpRate] = useState(100);

  // Current week string to use as a key
  const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const currentWeekStr = format(currentWeekStart, 'yyyy-MM-dd');

  // Load Employees
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error("Erro ao buscar funcionários:", error);
      } else if (data) {
        setEmployees(data.map(e => ({ id: e.id, name: e.name, dailyRate: e.daily_rate })));
      }
    };
    fetchEmployees();
  }, []);

  // Load Attendance for current week
  useEffect(() => {
    const fetchAttendance = async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('week_start', currentWeekStr);
      
      if (error) {
        console.error("Erro ao buscar presenças:", error);
      } else if (data) {
        const weekData = {};
        data.forEach(record => {
          if (!weekData[record.employee_id]) weekData[record.employee_id] = {};
          weekData[record.employee_id][record.day_id] = record.status;
        });
        setAttendance(prev => ({ ...prev, [currentWeekStr]: weekData }));
      }
    };
    fetchAttendance();
  }, [currentWeekStr]);

  // Employee Handlers
  const handleAddEmployeeClick = () => {
    setNewEmpName('');
    setNewEmpRate(100);
    setIsModalOpen(true);
  };

  const confirmAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;
    
    const { data, error } = await supabase
      .from('employees')
      .insert([{ name: newEmpName, daily_rate: newEmpRate }])
      .select();

    if (error) {
      console.error("Erro ao adicionar:", error);
    } else if (data && data.length > 0) {
      const newEmp = data[0];
      setEmployees(prev => [...prev, { id: newEmp.id, name: newEmp.name, dailyRate: newEmp.daily_rate }]);
    }
    setIsModalOpen(false);
  };

  const handleUpdateEmployee = async (id, field, value) => {
    // Optimistic update
    setEmployees(employees.map(emp => 
      emp.id === id ? { ...emp, [field]: value } : emp
    ));

    const dbField = field === 'dailyRate' ? 'daily_rate' : field;
    const { error } = await supabase
      .from('employees')
      .update({ [dbField]: value })
      .eq('id', id);
    
    if (error) {
      console.error("Erro ao atualizar:", error);
      // Reverter localmente seria o ideal numa aplicação real em caso de erro.
    }
  };

  const handleRemoveEmployee = async (id) => {
    // Optimistic update
    setEmployees(employees.filter(emp => emp.id !== id));

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error("Erro ao deletar:", error);
    }
  };

  // Attendance Handlers
  const handleToggleAttendance = async (empId, dayId, status) => {
    // Optimistic update
    setAttendance(prev => {
      const weekData = prev[currentWeekStr] || {};
      const empData = weekData[empId] || {};
      return {
        ...prev,
        [currentWeekStr]: {
          ...weekData,
          [empId]: {
            ...empData,
            [dayId]: status
          }
        }
      };
    });

    if (status === null) {
      // Remove record
      const { error } = await supabase
        .from('attendance')
        .delete()
        .match({ employee_id: empId, week_start: currentWeekStr, day_id: dayId });
      
      if (error) console.error("Erro ao remover presença:", error);
    } else {
      // Upsert
      const { error } = await supabase
        .from('attendance')
        .upsert({
          employee_id: empId,
          week_start: currentWeekStr,
          day_id: dayId,
          status: status
        }, {
          onConflict: 'employee_id, week_start, day_id'
        });
        
      if (error) console.error("Erro ao salvar presença:", error);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Controle de Ponto</h1>
        <div className="header-subtitle">Gerencie as presenças semanais e o pagamento da sua equipe</div>
      </header>

      <DashboardCards 
        employees={employees} 
        attendance={attendance} 
        currentWeekStr={currentWeekStr} 
      />

      <WeekNavigation 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate} 
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-1rem' }}>
        <button className="add-btn" onClick={handleAddEmployeeClick}>
          <Plus size={20} />
          Adicionar Funcionário
        </button>
      </div>

      <EmployeeTable 
        employees={employees}
        attendance={attendance}
        currentWeekStr={currentWeekStr}
        onUpdateEmployee={handleUpdateEmployee}
        onRemoveEmployee={handleRemoveEmployee}
        onToggleAttendance={handleToggleAttendance}
      />

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h2>Novo Funcionário</h2>
            <form onSubmit={confirmAddEmployee}>
              <div className="form-group">
                <label>Nome do Funcionário</label>
                <input 
                  type="text" 
                  className="modal-input"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label>Valor da Diária (R$)</label>
                <input 
                  type="number" 
                  className="modal-input"
                  value={newEmpRate}
                  onChange={(e) => setNewEmpRate(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="1"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="nav-btn" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="add-btn">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
