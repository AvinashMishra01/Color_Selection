import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Output,
  QueryList,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  COLOR_GRID_ITEMS_DEFAULT,
  COLOR_GRID_ITEM_SIZES,
  ColorGridItemSize,
  ColorGridItemComponent,
  ColorGridSelect,
  COLOR_GRID_SELECT,
} from './item';
import { FocusKeyManager } from '@angular/cdk/a11y';
import {
  DOWN_ARROW,
  LEFT_ARROW,
  RIGHT_ARROW,
  UP_ARROW,
} from '@angular/cdk/keycodes';
import { chunk, find, includes, indexOf } from 'lodash';
import { _getFocusedElementPierceShadowDom } from '@angular/cdk/platform';
import { Subject, takeUntil } from 'rxjs';

/**
 *
 * A lot of the code has been inspired by
 * [MatSelectionList](https://github.com/angular/components/blob/main/src/material/list/selection-list.ts)
 * for focus management and accessibility.
 *
 * @todo
 * - Handle {@link ColorGridSelectComponent._onKeydown}
 * - Calculate {@link ColorGridSelectComponent.grid}
 *
 * @link https://blog.angular-university.io/angular-custom-form-controls/
 */
@Component({
  selector: 'brew-color-grid-select',
  standalone: true,
  imports: [CommonModule, ColorGridItemComponent],
  templateUrl: './color-grid-select.component.html',
  styleUrl: './color-grid-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: ColorGridSelectComponent,
    },
    {
      provide: COLOR_GRID_SELECT,
      useExisting: ColorGridSelectComponent,
    },
  ],
})
export class ColorGridSelectComponent
  implements ControlValueAccessor, ColorGridSelect, AfterViewInit, OnDestroy
{
  private readonly _ngZone = inject(NgZone);
  private readonly _el = inject(ElementRef<ColorGridSelectComponent>);

  /** Emits when the list has been destroyed. */
  private readonly _destroyed = new Subject<void>();

  /** The number of items per row. Updated upon container size change */
  private readonly _itemsPerRow = signal(5);

  /** The items to be displayed in the grid */
  private readonly _items = signal(COLOR_GRID_ITEMS_DEFAULT);

  /** The size of the item in the grid */
  private readonly _itemSize = signal<ColorGridItemSize>(
    COLOR_GRID_ITEM_SIZES[0]
  );

  /** The FocusKeyManager which handles focus within the children item components */
  private _keyManager!: FocusKeyManager<ColorGridItemComponent>;

  /** The currently selected value */
  private _value?: string | null | undefined = COLOR_GRID_ITEMS_DEFAULT[0];

  private _disabled = false;
  private _touched = false;

  private _onTouched = (): void => void 0;
  private _onChange = (val?: string | null): void => void 0;

  @HostBinding('attr.tabindex')
  private get _tabIndex() {
    return -1;
    // return this.disabled ? -1 : 0;
  }

  /** The appropriate role of the listbox */
  @HostBinding('role')
  private get _role() {
    return 'radiogroup';
  }

  @ViewChildren(ColorGridItemComponent)
  private _colorGridItemsQl!: QueryList<ColorGridItemComponent>;

  @Input()
  public disabled = false;

  @Input()
  public set items(value) {
    this._items.set(value);
  }

  public get items() {
    return this._items();
  }

  @Input()
  public get itemSize(): ColorGridItemSize {
    return this._itemSize();
  }

  public set itemSize(value: ColorGridItemSize) {
    this._itemSize.set(value);
  }

  @Input()
  public get value(): string | null | undefined {
    return this._value;
  }

  public set value(value: string | null | undefined) {
    this._value = value;
    // this._updateKeyManagerActiveItem();
  }

  /** Emits when the selected value changes. Naming convention supports `[(value)]` usage */
  @Output()
  public readonly valueChange = new EventEmitter<string | null | undefined>();

  /** The computed 2d grid of items */
  public readonly grid = computed((): string[][] =>
    chunk(this._items(), this._itemsPerRow())
  );

  // ControlValueAccessor implementation
  public writeValue(val: string): void {
    this.value = val;
  }

  public registerOnChange(onChange: (val?: string | null) => void): void {
    this._onChange = onChange;
  }

  public registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  public setDisabledState(isDisabled: boolean): void {
    this._disabled = isDisabled;
  }
  // /ControlValueAccessor implementation

  /** Marks the component as touched */
  public markAsTouched() {
    if (!this._touched) {
      this._onTouched();
      this._touched = true;
    }
  }

  /** Implemented as part of {@link ColorGridSelect} interface */
  public emitChange(value?: string | null | undefined) {
    this.markAsTouched();

    if (!this._disabled) {
      this.value = value;
      this._onChange(this.value);
      this.valueChange.emit(value);
    }
  }

  public ngAfterViewInit() {
    this._keyManager = new FocusKeyManager(this._colorGridItemsQl)
      .withHomeAndEnd()
      .withHorizontalOrientation('ltr')
      .skipPredicate(() => this.disabled)
      .withWrap();

    // Set the initial focus.
    this._resetActiveOption();

    // If the active item is removed from the list, reset back to the first one.
    this._colorGridItemsQl.changes
      .pipe(takeUntil(this._destroyed))
      .subscribe(() => {
        const activeItem = this._keyManager.activeItem;

        if (
          !activeItem ||
          this._colorGridItemsQl.toArray().indexOf(activeItem) === -1
        ) {
          this._resetActiveOption();
        }
      });

    // These events are bound outside the zone, because they don't change
    // any change-detected properties and they can trigger timeouts.
    this._ngZone.runOutsideAngular(() => {
      this._el.nativeElement.addEventListener('focusin', this._handleFocusin);
      this._el.nativeElement.addEventListener('focusout', this._handleFocusout);
    });
  }

  public ngOnDestroy() {
    this._keyManager.destroy();
    this._el.nativeElement.removeEventListener('focusin', this._handleFocusin);
    this._el.nativeElement.removeEventListener(
      'focusout',
      this._handleFocusout
    );

    this._destroyed.next();
    this._destroyed.complete();
  }

  /**
   * @todo
   * The logic to decide how to navigate inside the grid when the
   * up, down, left and right buttons are pressed
   */
// Avinash 
@HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const columns = this.columns-1;
    const grid = this.grid();
    const totalCircles = grid.flat().length;
    const rows = Math.ceil(totalCircles / columns);
console.log("this is the ata", columns, rows, totalCircles, event.key, this.selectedCircle)
    switch (event.key) {
      case 'ArrowUp':
        if (this.selectedCircle >= columns) {
          this.selectedCircle -= columns;
          console.log("upper arrow", this.selectedCircle)
          }
        this._setActiveOption(this.selectedCircle);
        break;
      case 'ArrowDown':
        if (this.selectedCircle + columns < totalCircles) {
          this.selectedCircle += columns;
          console.log("Down Arrow", this.selectedCircle)
          }
        this._setActiveOption(this.selectedCircle);
        break;
      case 'ArrowLeft':
        if ((this.selectedCircle + 1) % columns === 1) { // Start of a row
          if (this.selectedCircle + 1 === totalCircles) {
            this.selectedCircle = 0; // Wrap to first circle
            console.log("Left Arrow", this.selectedCircle)
           
          } else {
            this.selectedCircle = (Math.floor(this.selectedCircle / columns) + 1) * columns; // Move to next row's start
            console.log("Next Row", this.selectedCircle)
         
          }
        } else {
          this.selectedCircle--;
          }
        // this._setActiveOption(this.selectedCircle);
        break;
      case 'ArrowRight':
        console.log("Right arroe ")
          if ((this.selectedCircle + 1) % columns === 0 || this.selectedCircle === totalCircles - 1) {
          if (this.selectedCircle % columns === 0) {
            this.selectedCircle = this.selectedCircle - columns + 1;
            
          } else if (this.selectedCircle + 1 === totalCircles) {
            this.selectedCircle = 0; // Wrap to first circle
          
          } else {
            this.selectedCircle = (Math.floor(this.selectedCircle / columns) + 1) * columns; // Move to next row's start
         
          }
        } else {
          this.selectedCircle++;
          }
        // this._setActiveOption(this.selectedCircle);
        break;
    }
    if (
      includes([UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW], event.keyCode)
    ) {
      console.log("this is parent ", event.key, this.selectedCircle)
      this._keyManager.onKeydown(event);
    }
  }

// end 
  // @HostListener('keydown', ['$event'])
  //  handleKeyDown(event: KeyboardEvent) {
  //   console.log("key press", event.key)
  //   switch (event.key) {
  //     case 'ArrowUp':
  //       this._navigateVertically(-1);
  //       break;
  //     case 'ArrowDown':
  //       this._navigateVertically(1);
  //       break;
  //   }

    // switch (event.keyCode) {
    //   case UP_ARROW:
    //     // add logic
    //     break;
    //   case DOWN_ARROW:
    //     // add logic
    //     break;
    //   case LEFT_ARROW:
    //     // add logic
    //     break;
    //   case RIGHT_ARROW: {
    //     // add logic
    //     break;
    //   }
    // }

    // @fixme remove the following code block after
    // the above navigation logic is completed
    // ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
  //   if (
  //     includes([UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW], event.keyCode)
  //   ) {
  //     console.log("this is parent ")
      // this._keyManager.onKeydown(event);
  //   }
  //   // ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
  // }
  private _navigateVertically(direction: number) {
    // Extract the value from the Signal
    const grid = this.grid();
  
    if (!grid || !grid.length) return;
  
    const flatGrid = grid.flat();
    const currentIndex = flatGrid.findIndex((item) => item === this._value);
    const numRows = grid.length;
    const numCols = grid[0].length;
  
    // Calculate the index of the item after moving vertically
    let newIndex = currentIndex + direction * numCols;
  console.log("vertical",flatGrid,currentIndex,numRows,numRows,newIndex)
    // Ensure newIndex is within the bounds of the grid
    newIndex = Math.max(0, Math.min(flatGrid.length - 1, newIndex));
  console.log("new value is ", newIndex)
    // Update the value of the active item
    const newValue = flatGrid[newIndex];
    if (newValue !== this._value) {
      this._value = newValue;
      this.emitChange(this._value);
    }
  }
  

  // private _navigateVertically(direction: number) {
  //   // Extract the value from the Signal

  //   const grid = this.grid();
  // console.log("this is grid ", grid.length, direction)
  //   if (!grid || !grid.length) return;
  
  //   const flatGrid = grid.flat();
  //   const currentIndex = flatGrid.findIndex(item => item === this._value);
  //   const numRows = grid.length;
  //   const numCols = grid[0].length;
  
  //   // Calculate the index of the item after moving vertically
  //   let newIndex = currentIndex + direction * numCols;
  
  //   // Ensure newIndex is within the bounds of the grid
  //   newIndex = Math.max(0, Math.min(flatGrid.length - 1, newIndex));
  
  //   // Update the value of the active item
  //   this._value = flatGrid[newIndex];

  //   // Emit change event
  //   console.log("this is the directions vale ==", this._value)
  //   this.emitChange(this._value);
  // }
  

  /** Handles focusout events within the list. */
  private readonly _handleFocusout = () => {
    // Focus takes a while to update so we have to wrap our call in a timeout.
    setTimeout(() => {
      if (!this._containsFocus()) {
        this._resetActiveOption();
      }
    });
  };

  /** Handles focusin events within the list. */
  private readonly _handleFocusin = (event: FocusEvent) => {
    if (this.disabled) {
      return;
    }

    const activeIndex = this._colorGridItemsQl
      .toArray()
      .findIndex((item) =>
        item.elRef.nativeElement.contains(event.target as HTMLElement)
      );
      console.log("Focusin event - activeIndex:", activeIndex, "Event target:", event.target);

    if (activeIndex > -1) {
      this._setActiveOption(activeIndex);
    } else {
      this._resetActiveOption();
    }
  };

  /**
   * Sets an option as active.
   * @param index Index of the active option.
   *              If set to -1, no option will be active.
   */

  selectedCircle: number = 0;
  private _setActiveOption(index: number) {
    console.log("this is the setActive tab ", index)
    this.selectedCircle=index;
    this._colorGridItemsQl.forEach((item, itemIndex) =>
      item.setTabindex(itemIndex === index ? 0 : -1)
    );
  
    this._keyManager.updateActiveItem(index);
    // this._keyManager.setActiveItem(index);
  }


// Avinash 



get columns(): number {
  console.log("inner width", Math.floor(window.innerWidth / 70))
  return Math.floor(window.innerWidth / 70); // 50px circle + 20px gap (10px each side)
}



// Avinash end 



  /**
   * Resets the active option.
   *
   * When the list is disabled,
   * remove all options from to the tab order.
   * Otherwise, focus the first selected option.
   */
  private _resetActiveOption() {
    let index = -1;

    if (!this.disabled) {
      const colorGridItems = this._colorGridItemsQl.toArray();

      const activeItem =
        find(colorGridItems, (item) => item.checked && !item.disabled) ??
        this._colorGridItemsQl.first;

      index = activeItem ? indexOf(colorGridItems, activeItem) : -1;
    }

    this._setActiveOption(index);
  }

  /** Returns whether the focus is currently within the list. */
  private _containsFocus() {
    const activeElement = _getFocusedElementPierceShadowDom();
    return activeElement && this._el.nativeElement.contains(activeElement);
  }
}
