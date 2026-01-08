// Looker Studio Community Visualization API wrapper
class OHLCVisualization {
  constructor() {
    this.container = document.getElementById('chart-container');
    // Initialize standard margins
    this.margins = {top: 40, right: 60, bottom: 40, left: 60};
    
    // Theme Definitions
    this.themes = {
      light: {
        background: '#ffffff',
        textColor: '#333333',
        gridColor: '#e0e0e0',
        axisColor: '#666666',
        candleUp: '#26a69a',
        candleDown: '#ef5350',
        scoreLine: '#2196f3',
        bullishArrow: '#4caf50',
        bearishArrow: '#f44336',
        maColors: {
          ma3: '#FF6B6B', ma14: '#4ECDC4', ma20: '#45B7D1',
          ma50: '#96CEB4', ma100: '#FECA57', ma200: '#FF9FF3'
        }
      },
      dark: {
        background: '#1e1e1e',
        textColor: '#e0e0e0',
        gridColor: '#444444',
        axisColor: '#aaaaaa',
        candleUp: '#66bb6a',
        candleDown: '#ef5350',
        scoreLine: '#42a5f5',
        bullishArrow: '#66bb6a',
        bearishArrow: '#ef5350',
        maColors: {
          ma3: '#ff8a80', ma14: '#80deea', ma20: '#82b1ff',
          ma50: '#a5d6a7', ma100: '#fff59d', ma200: '#f8bbd0'
        }
      }
    };
    
    this.currentTheme = 'light';
    this.styleSettings = {};
  }
  
  /**
   * Main processing function for Looker Studio Data
   * @param {Object} lookerData - Raw data from DSCC
   */
  processLookerStudioData(lookerData) {
    // 1. Validation
    if (!lookerData.tables || !lookerData.tables.DEFAULT || lookerData.tables.DEFAULT.length === 0) {
      return [];
    }

    // 2. Map Fields based on Manifest Structure
    // The manifest defines 1 Dimension (Date) and 5 Metrics.
    // Looker Studio sends them in the order defined in the "data" array of manifest.
    // tables.DEFAULT structure: [{ dimID: [val], metricID: [val, val, val, val, val] }]
    
    const rows = lookerData.tables.DEFAULT;
    
    const rawData = rows.map(row => {
      // Dimension 0: Date
      const dateStr = row.barDimension ? row.barDimension[0] : row.dimID[0]; 
      
      // Metrics: Open(0), High(1), Low(2), Close(3), Score(4)
      const metrics = row.metricID; 
      
      // Handle potential formatting issues (Looker sometimes sends strings for numbers)
      return {
        date: this.parseDate(dateStr),
        open: Number(metrics[0]),
        high: Number(metrics[1]),
        low: Number(metrics[2]),
        close: Number(metrics[3]),
        score: Number(metrics[4])
      };
    });

    // 3. DEDUPLICATION (Fixes "Doubled Dates" bug)
    // If the data source has multiple rows for one day, we take the last one.
    const uniqueDataMap = new Map();
    rawData.forEach(item => {
      if(item.date && !isNaN(item.date)) {
        // Use ISO string as key to ensure uniqueness
        uniqueDataMap.set(item.date.toISOString().split('T')[0], item);
      }
    });

    // Convert back to array and sort
    const sortedData = Array.from(uniqueDataMap.values()).sort((a, b) => a.date - b.date);

    return sortedData;
  }

  // Helper to parse Looker dates (YYYYMMDD or ISO)
  parseDate(dateStr) {
    if (!dateStr) return null;
    // Looker often sends "20230101" for standard dates
    if (dateStr.length === 8 && !isNaN(dateStr)) {
        const y = dateStr.substring(0, 4);
        const m = dateStr.substring(4, 6);
        const d = dateStr.substring(6, 8);
        return new Date(`${y}-${m}-${d}`);
    }
    return new Date(dateStr);
  }
  
  // Calculate moving averages
  calculateMovingAverages(data) {
    const periods = [3, 14, 20, 50, 100, 200];
    // We modify the objects in place or create a copy. A copy is safer.
    const result = data.map(d => ({...d}));
    
    periods.forEach(period => {
      let sum = 0;
      // Simple Moving Average Calculation
      for (let i = 0; i < result.length; i++) {
        sum += result[i].close;
        if (i >= period) {
          sum -= result[i - period].close;
          result[i][`ma${period}`] = sum / period;
        } else if (i === period - 1) {
           result[i][`ma${period}`] = sum / period;
        } else {
           result[i][`ma${period}`] = null;
        }
      }
    });
    
    return result;
  }
  
  // Detect signal arrows based on user logic
  detectSignalArrows(data) {
    return data.map((d, i) => {
      if (i === 0) return { ...d, bullishSignal: false, bearishSignal: false };
      
      const prevScore = data[i-1].score;
      const currentScore = d.score;
      
      // Logic: Cross BELOW 5 to ABOVE 5
      const bullish = (prevScore <= 5 && currentScore > 5);
      
      // Logic: Cross ABOVE -5 to BELOW -5
      const bearish = (prevScore >= -5 && currentScore < -5);
      
      return {
        ...d,
        bullishSignal: bullish,
        bearishSignal: bearish
      };
    });
  }
  
  renderChart(data) {
    this.container.innerHTML = '';
    
    // Update dimensions
    const width = this.container.offsetWidth;
    const height = this.container.offsetHeight || 500;
    const chartWidth = width - this.margins.left - this.margins.right;
    const chartHeight = height - this.margins.top - this.margins.bottom;
    
    const theme = this.themes[this.currentTheme];
    
    // SVG Setup
    const svg = d3.select(this.container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background-color', theme.background);
      
    // Clip path to prevent drawing outside axes
    svg.append("defs").append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    const chartArea = svg.append('g')
      .attr('transform', `translate(${this.margins.left}, ${this.margins.top})`);
    
    // --- SCALES ---
    
    // X Scale
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([0, chartWidth]);

    // Y Price Scale (Left) - Dynamic domain based on visible High/Low/MAs
    const allValues = [];
    data.forEach(d => {
      allValues.push(d.low, d.high);
      if(this.styleSettings.ma3_enabled && d.ma3) allValues.push(d.ma3);
      if(this.styleSettings.ma200_enabled && d.ma200) allValues.push(d.ma200);
      // Add other MAs to domain calculation if strictly necessary, 
      // but usually High/Low covers most, except when price drops significantly below a long MA.
    });

    const priceMin = d3.min(allValues) * 0.995; // Add tiny padding
    const priceMax = d3.max(allValues) * 1.005;

    const yScalePrice = d3.scaleLinear()
      .domain([priceMin, priceMax])
      .range([chartHeight, 0]);

    // Y Score Scale (Right) - Fixed -10 to 10
    const yScaleScore = d3.scaleLinear()
      .domain([-10, 10])
      .range([chartHeight, 0]);

    // --- AXES ---

    // Grid Lines
    chartArea.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScalePrice)
        .tickSize(-chartWidth)
        .tickFormat('')
      )
      .selectAll('line')
      .style('stroke', theme.gridColor)
      .style('stroke-opacity', 0.3);

    // X Axis - Fix for "Doubled Dates": limit ticks
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat('%b %d'));
    
    // If width is small, reduce ticks
    if (width < 600) xAxis.ticks(5);
    else xAxis.ticks(10);

    chartArea.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('fill', theme.textColor);

    // Left Axis (Price)
    chartArea.append('g')
      .call(d3.axisLeft(yScalePrice))
      .selectAll('text')
      .style('fill', theme.textColor);

    // Right Axis (Score)
    chartArea.append('g')
      .attr('transform', `translate(${chartWidth}, 0)`)
      .call(d3.axisRight(yScaleScore).ticks(5))
      .selectAll('text')
      .style('fill', theme.scoreLine);

    // --- DRAWING ---

    const contentGroup = chartArea.append('g').attr("clip-path", "url(#clip)");

    // 1. Candles
    // Calculate intelligent width. 
    // If we have gaps (weekends), timeScale makes them empty space.
    // We check the minimum time difference between any two points to determine candle width.
    let minDiff = Infinity;
    for(let i=1; i<data.length; i++) {
        const diff = data[i].date - data[i-1].date;
        if(diff < minDiff) minDiff = diff;
    }
    // Convert time diff to pixels approximately
    // If minDiff is 1 day (86400000ms)
    const timeSpan = xScale.domain()[1] - xScale.domain()[0];
    const pixelPerTime = chartWidth / timeSpan;
    
    // Width is time_diff * pixels_per_time * 0.7 (padding)
    // Fallback to 10px if calculation fails
    let candleWidth = Math.max(2, (minDiff * pixelPerTime) * 0.7); 
    if (candleWidth > 40) candleWidth = 40; // Max width cap

    const candles = contentGroup.selectAll('.candle')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'candle');

    // Wicks
    candles.append('line')
      .attr('x1', d => xScale(d.date))
      .attr('x2', d => xScale(d.date))
      .attr('y1', d => yScalePrice(d.high))
      .attr('y2', d => yScalePrice(d.low))
      .attr('stroke', d => d.close >= d.open ? theme.candleUp : theme.candleDown)
      .attr('stroke-width', 1);

    // Bodies
    candles.append('rect')
      .attr('x', d => xScale(d.date) - candleWidth/2)
      .attr('y', d => yScalePrice(Math.max(d.open, d.close)))
      .attr('width', candleWidth)
      .attr('height', d => Math.max(1, Math.abs(yScalePrice(d.open) - yScalePrice(d.close))))
      .attr('fill', d => d.close >= d.open ? theme.candleUp : theme.candleDown)
      .attr('stroke', d => d.close >= d.open ? theme.candleUp : theme.candleDown);

    // 2. Moving Averages
    const drawMA = (period, color, enabled) => {
      if (!enabled) return;
      
      const lineGen = d3.line()
        .defined(d => d[`ma${period}`] !== null)
        .x(d => xScale(d.date))
        .y(d => yScalePrice(d[`ma${period}`]))
        .curve(d3.curveBasis); // Smooth curve for MAs

      contentGroup.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', lineGen);
    };

    // Draw enabled MAs based on Style Settings
    drawMA(3, theme.maColors.ma3, this.styleSettings.ma3_enabled);
    drawMA(14, theme.maColors.ma14, this.styleSettings.ma14_enabled);
    drawMA(20, theme.maColors.ma20, this.styleSettings.ma20_enabled);
    drawMA(50, theme.maColors.ma50, this.styleSettings.ma50_enabled);
    drawMA(100, theme.maColors.ma100, this.styleSettings.ma100_enabled);
    drawMA(200, theme.maColors.ma200, this.styleSettings.ma200_enabled);

    // 3. Score Line (Dashed)
    const scoreLine = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScaleScore(d.score))
      .curve(d3.curveMonotoneX);

    contentGroup.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', theme.scoreLine)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.8)
      .attr('d', scoreLine);

    // 4. Arrows
    // Bullish (Triangle Up)
    contentGroup.selectAll('.arrow-up')
      .data(data.filter(d => d.bullishSignal))
      .enter()
      .append('path')
      .attr('d', d3.symbol().type(d3.symbolTriangle).size(80))
      .attr('transform', d => `translate(${xScale(d.date)}, ${yScalePrice(d.low) + 15})`)
      .attr('fill', theme.bullishArrow);

    // Bearish (Triangle Down)
    contentGroup.selectAll('.arrow-down')
      .data(data.filter(d => d.bearishSignal))
      .enter()
      .append('path')
      .attr('d', d3.symbol().type(d3.symbolTriangle).size(80))
      .attr('transform', d => `translate(${xScale(d.date)}, ${yScalePrice(d.high) - 15}) rotate(180)`)
      .attr('fill', theme.bearishArrow);

    // Legend / Title
    svg.append('text')
      .attr('x', this.margins.left)
      .attr('y', this.margins.top - 15)
      .attr('fill', theme.textColor)
      .attr('font-size', '16px')
      .attr('font-weight', 'bold')
      .text('EdgeFinder Analysis');
  }
  
  // Entry Point
  draw(data) {
    // 1. Parse Style Settings
    if (data.style) {
      this.currentTheme = data.style.theme && data.style.theme.value ? data.style.theme.value : 'light';
      // Map other styles
      this.styleSettings = {
        ma3_enabled: data.style.ma3_enabled && data.style.ma3_enabled.value !== undefined ? data.style.ma3_enabled.value : true,
        ma14_enabled: data.style.ma14_enabled && data.style.ma14_enabled.value !== undefined ? data.style.ma14_enabled.value : false,
        ma20_enabled: data.style.ma20_enabled && data.style.ma20_enabled.value !== undefined ? data.style.ma20_enabled.value : true,
        ma50_enabled: data.style.ma50_enabled && data.style.ma50_enabled.value !== undefined ? data.style.ma50_enabled.value : true,
        ma100_enabled: data.style.ma100_enabled && data.style.ma100_enabled.value !== undefined ? data.style.ma100_enabled.value : false,
        ma200_enabled: data.style.ma200_enabled && data.style.ma200_enabled.value !== undefined ? data.style.ma200_enabled.value : true,
      };
    }

    // 2. Process Data
    const cleanData = this.processLookerStudioData(data);
    
    if (cleanData.length === 0) {
      this.container.innerHTML = '<div class="no-data">No Data Available</div>';
      return;
    }

    // 3. Logic & Render
    const dataWithMA = this.calculateMovingAverages(cleanData);
    const finalData = this.detectSignalArrows(dataWithMA);
    
    this.renderChart(finalData);
  }
}

// Global Setup
let viz = new OHLCVisualization();

// Subscribe to DSCC
if (typeof dscc !== 'undefined') {
  dscc.subscribeToData(data => viz.draw(data), { transform: dscc.objectTransform });
} else {
  // Local development fallback
  console.warn("DSCC library not found - Running in standalone/dev mode.");
}
