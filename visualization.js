// Looker Studio Community Visualization API wrapper
class OHLCVisualization {
  constructor() {
    this.container = document.getElementById('chart-container');
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight || 500;
    this.margins = {top: 50, right: 50, bottom: 80, left: 80};
    this.chartWidth = this.width - this.margins.left - this.margins.right;
    this.chartHeight = this.height - this.margins.top - this.margins.bottom;
    
    this.themes = {
      light: {
        background: '#ffffff',
        textColor: '#333333',
        gridColor: '#e0e0e0',
        axisColor: '#666666',
        candleUp: '#26a69a',
        candleDown: '#ef5350',
        scoreLine: '#2196f3',
        scoreAreaPositive: 'rgba(38, 166, 154, 0.2)',
        scoreAreaNegative: 'rgba(239, 83, 80, 0.2)',
        bullishArrow: '#4caf50',
        bearishArrow: '#f44336',
        maColors: {
          ma3: '#FF6B6B',
          ma14: '#4ECDC4', 
          ma20: '#45B7D1',
          ma50: '#96CEB4',
          ma100: '#FECA57',
          ma200: '#FF9FF3'
        }
      },
      dark: {
        background: '#1e1e1e',
        textColor: '#ffffff',
        gridColor: '#444444',
        axisColor: '#aaaaaa',
        candleUp: '#66bb6a',
        candleDown: '#ef5350',
        scoreLine: '#42a5f5',
        scoreAreaPositive: 'rgba(102, 187, 106, 0.2)',
        scoreAreaNegative: 'rgba(239, 83, 80, 0.2)',
        bullishArrow: '#66bb6a',
        bearishArrow: '#ef5350',
        maColors: {
          ma3: '#ff8a80',
          ma14: '#80deea',
          ma20: '#82b1ff', 
          ma50: '#a5d6a7',
          ma100: '#fff59d',
          ma200: '#f8bbd0'
        }
      }
    };
    
    this.currentTheme = 'light';
    this.currentData = [];
  }
  
  // Process data from Looker Studio
  processLookerStudioData(lookerData) {
    if (!lookerData || !lookerData.tables || !lookerData.tables[0]) return [];
    
    const table = lookerData.tables[0];
    const rows = table.rows;
    const fields = table.columns.map(col => col.name);
    
    // Map field indices
    const dateIdx = fields.findIndex(f => f.toLowerCase().includes('date'));
    const openIdx = fields.findIndex(f => f.toLowerCase() === 'open');
    const highIdx = fields.findIndex(f => f.toLowerCase() === 'high');
    const lowIdx = fields.findIndex(f => f.toLowerCase() === 'low');
    const closeIdx = fields.findIndex(f => f.toLowerCase() === 'close');
    const scoreIdx = fields.findIndex(f => f.toLowerCase() === 'score');
    
    if (dateIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1 || scoreIdx === -1) {
      console.error('Required fields not found in data');
      return [];
    }
    
    return rows.map(row => ({
      date: new Date(row[dateIdx]),
      open: parseFloat(row[openIdx]),
      high: parseFloat(row[highIdx]),
      low: parseFloat(row[lowIdx]),
      close: parseFloat(row[closeIdx]),
      score: parseFloat(row[scoreIdx]),
      ticker: row[fields.findIndex(f => f.toLowerCase().includes('ticker'))] || 'SYMBOL'
    })).sort((a, b) => a.date - b.date);
  }
  
  // Calculate moving averages
  calculateMovingAverages(data) {
    const periods = [3, 14, 20, 50, 100, 200];
    const result = [...data]; // Create a copy
    
    periods.forEach(period => {
      result.forEach((d, i) => {
        if (i < period - 1) {
          d[`ma${period}`] = null;
          return;
        }
        
        const sum = data.slice(i - period + 1, i + 1).reduce((acc, curr) => acc + curr.close, 0);
        d[`ma${period}`] = sum / period;
      });
    });
    
    return result;
  }
  
  // Detect signal arrows
  detectSignalArrows(data) {
    return data.map((d, i) => {
      if (i === 0) return { ...d, bullishSignal: false, bearishSignal: false };
      
      const prevScore = data[i-1].score;
      const currentScore = d.score;
      
      return {
        ...d,
        bullishSignal: prevScore <= 5 && currentScore > 5,
        bearishSignal: prevScore >= -5 && currentScore < -5
      };
    });
  }
  
  // Render the main chart
  renderChart(data) {
    if (!data || data.length === 0) {
      this.renderNoDataMessage();
      return;
    }
    
    // Clear previous chart
    this.container.innerHTML = '';
    
    // Set up SVG
    const svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .style('background-color', this.themes[this.currentTheme].background);
    
    // Create chart area
    const chartArea = svg.append('g')
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`);
    
    // Get theme colors
    const theme = this.themes[this.currentTheme];
    
    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([0, this.chartWidth]);
    
    const priceDomain = [
      d3.min(data, d => Math.min(d.low, d.ma3 || d.ma14 || d.ma20 || d.ma50 || d.ma100 || d.ma200 || d.low)),
      d3.max(data, d => Math.max(d.high, d.ma3 || d.ma14 || d.ma20 || d.ma50 || d.ma100 || d.ma200 || d.high))
    ];
    
    const yScale = d3.scaleLinear()
      .domain(priceDomain)
      .range([this.chartHeight, 0]);
    
    const scoreScale = d3.scaleLinear()
      .domain([-10, 10])
      .range([this.chartHeight, 0]);
    
    // Add grid lines
    chartArea.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .ticks(10)
        .tickSize(-this.chartWidth)
        .tickFormat('')
      )
      .selectAll('line')
      .style('stroke', theme.gridColor)
      .style('stroke-opacity', 0.5);
    
    // Add axes
    chartArea.append('g')
      .attr('transform', `translate(0, ${this.chartHeight})`)
      .call(d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat('%b %d'))
      )
      .selectAll('text')
      .style('fill', theme.textColor)
      .style('font-size', '12px');
    
    chartArea.append('g')
      .call(d3.axisLeft(yScale)
        .tickFormat(d => `$${d3.format('.2f')(d)}`))
      .selectAll('text')
      .style('fill', theme.textColor)
      .style('font-size', '12px');
    
    // Draw candlesticks
    // Calculate candleWidth based on actual spacing between dates
    let candleWidth = 12; // Default reasonable width

    if (data.length > 1) {
      // Get pixel distance between first two consecutive dates using existing xScale
      const firstDatePixel = xScale(data[0].date);
      const secondDatePixel = xScale(data[1].date);
      const pixelsBetweenDates = Math.abs(secondDatePixel - firstDatePixel);
      
      // Use 60% of the spacing between dates as the candle width
      // This leaves 40% as whitespace/gaps
      candleWidth = Math.max(2, Math.min(25, pixelsBetweenDates * 0.6));
    }
    
    chartArea.selectAll('.candle')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'candle')
      .each(function(d) {
        const candle = d3.select(this);
        const x = xScale(d.date) - candleWidth/2;
        const yHigh = yScale(d.high);
        const yLow = yScale(d.low);
        const yOpen = yScale(d.open);
        const yClose = yScale(d.close);
        
        // Draw wick
        candle.append('line')
          .attr('x1', xScale(d.date))
          .attr('x2', xScale(d.date))
          .attr('y1', yHigh)
          .attr('y2', yLow)
          .attr('stroke', d.close >= d.open ? theme.candleUp : theme.candleDown)
          .attr('stroke-width', 1);
        
        // Draw body
        candle.append('rect')
          .attr('x', x)
          .attr('y', d.close >= d.open ? yClose : yOpen)
          .attr('width', candleWidth)
          .attr('height', Math.abs(yClose - yOpen))
          .attr('fill', d.close >= d.open ? theme.candleUp : theme.candleDown)
          .attr('stroke', d.close >= d.open ? theme.candleUp : theme.candleDown);
      });
    
    // Draw moving averages (with toggle functionality)
    const maPeriods = [3, 14, 20, 50, 100, 200];
    maPeriods.forEach(period => {
      const maData = data
        .map((d, i) => ({
          date: d.date,
          value: d[`ma${period}`]
        }))
        .filter(d => d.value !== null);
      
      if (maData.length > 0 && document.getElementById(`ma${period}`)?.checked) {
        const line = d3.line()
          .x(d => xScale(d.date))
          .y(d => yScale(d.value))
          .curve(d3.curveMonotoneX);
        
        chartArea.append('path')
          .datum(maData)
          .attr('fill', 'none')
          .attr('stroke', theme.maColors[`ma${period}`])
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', period >= 50 ? '5,5' : 'none')
          .attr('d', line);
      }
    });
    
    // Draw EdgeFinder score line
    const scoreLine = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.score / 10 * (priceDomain[1] - priceDomain[0]) + priceDomain[0]))
      .curve(d3.curveMonotoneX);
    
    chartArea.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', theme.scoreLine)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,3')
      .attr('d', scoreLine);
    
    // Draw signal arrows
    data.forEach((d, i) => {
      if (d.bullishSignal) {
        chartArea.append('path')
          .attr('d', d3.symbol().type(d3.symbolTriangle).size(100))
          .attr('transform', `translate(${xScale(d.date)}, ${yScale(d.low) + 20}) rotate(180)`)
          .attr('fill', theme.bullishArrow)
          .attr('stroke', theme.bullishArrow);
      }
      
      if (d.bearishSignal) {
        chartArea.append('path')
          .attr('d', d3.symbol().type(d3.symbolTriangle).size(100))
          .attr('transform', `translate(${xScale(d.date)}, ${yScale(d.high) - 20})`)
          .attr('fill', theme.bearishArrow)
          .attr('stroke', theme.bearishArrow);
      }
    });
    
    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top - 30})`);
    
    legend.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', theme.textColor)
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text(data[0].ticker || 'Asset');
    
    // Add score annotation
    svg.append('text')
      .attr('x', this.width - this.margins.right)
      .attr('y', this.margins.top - 10)
      .attr('text-anchor', 'end')
      .attr('fill', theme.scoreLine)
      .attr('font-size', '12px')
      .text('EdgeFinder Score');
  }
  
  renderNoDataMessage() {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: ${this.themes[this.currentTheme].textColor};">
        <h3>No Data Available</h3>
        <p>Please ensure your data source includes the required fields:</p>
        <ul style="text-align: left; margin-top: 10px;">
          <li>Date</li>
          <li>Open</li>
          <li>High</li> 
          <li>Low</li>
          <li>Close</li>
          <li>Score</li>
          <li>Ticker (optional)</li>
        </ul>
      </div>
    `;
  }
  
  // Main entry point for Looker Studio
  draw(lookerData) {
    try {
      // Process data
      const processedData = this.processLookerStudioData(lookerData);
      
      if (processedData.length === 0) {
        this.renderNoDataMessage();
        return;
      }
      
      // Calculate moving averages
      const dataWithMAs = this.calculateMovingAverages(processedData);
      
      // Detect signals
      const finalData = this.detectSignalArrows(dataWithMAs);
      
      // Store current data for resize
      this.currentData = finalData;
      
      // Render chart
      this.renderChart(finalData);
      
    } catch (error) {
      console.error('Error rendering chart:', error);
      this.container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: red;">
          <p>Error rendering chart: ${error.message}</p>
        </div>
      `;
    }
  }
  
  updateSize(width, height) {
    this.width = width;
    this.height = height;
    this.chartWidth = width - this.margins.left - this.margins.right;
    this.chartHeight = height - this.margins.top - this.margins.bottom;
    
    // Redraw if data exists
    if (this.currentData && this.currentData.length > 0) {
      this.renderChart(this.currentData);
    }
  }
  
  setTheme(theme) {
    if (this.themes[theme]) {
      this.currentTheme = theme;
      // Apply theme to body
      document.body.style.backgroundColor = this.themes[theme].background;
      document.body.style.color = this.themes[theme].textColor;
      
      // Redraw if data exists
      if (this.currentData && this.currentData.length > 0) {
        this.renderChart(this.currentData);
      }
    }
  }
}

// Initialize the visualization
let visualization;

// Looker Studio Community Visualization API
function setupLookerStudio() {
  if (typeof dscc === 'undefined') {
    console.log('Running in development mode');
    return;
  }
  
  // Subscribe to data changes
  dscc.subscribeToData(data => {
    if (!visualization) {
      visualization = new OHLCVisualization();
    }
    
    visualization.draw(data);
  }, {transform: dscc.basicTransform});
  
  // Handle resize events
  dscc.subscribeToResize((width, height) => {
    if (visualization) {
      visualization.updateSize(width, height);
    }
  });
  
  // Handle style changes
  dscc.subscribeToStyle(style => {
    if (visualization) {
      const theme = style.theme || 'light';
      visualization.setTheme(theme === 'DARK' ? 'dark' : 'light');
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize visualization
  visualization = new OHLCVisualization();
  
  // Set up Looker Studio integration
  if (typeof dscc !== 'undefined') {
    setupLookerStudio();
  } else {
    console.log('Running in standalone mode');
    // Load sample data for development
    visualization.draw({
      tables: [{
        columns: [
          {name: 'date'}, {name: 'open'}, {name: 'high'}, {name: 'low'}, {name: 'close'}, {name: 'score'}, {name: 'ticker'}
        ],
        rows: [
          ['2024-01-01', '100', '105', '98', '103', '3', 'AAPL'],
          ['2024-01-02', '103', '108', '102', '107', '6', 'AAPL'],
          ['2024-01-03', '107', '110', '105', '106', '-3', 'AAPL'],
          ['2024-01-04', '106', '109', '104', '108', '-6', 'AAPL'],
          ['2024-01-05', '108', '112', '107', '111', '4', 'AAPL'],
          ['2024-01-06', '111', '115', '110', '114', '7', 'AAPL'],
          ['2024-01-07', '114', '116', '112', '113', '-2', 'AAPL'],
          ['2024-01-08', '113', '118', '112', '117', '-7', 'AAPL']
        ]
      }]
    });
  }
  
  // Handle window resize
  window.addEventListener('resize', function() {
    if (visualization) {
      visualization.updateSize(
        document.getElementById('chart-container').offsetWidth,
        document.getElementById('chart-container').offsetHeight || 500
      );
    }
  });
});
