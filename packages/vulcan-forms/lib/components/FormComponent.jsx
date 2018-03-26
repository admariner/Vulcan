import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { intlShape } from 'meteor/vulcan:i18n';
import classNames from 'classnames';
import { Components } from 'meteor/vulcan:core';
import { registerComponent } from 'meteor/vulcan:core';
import debounce from 'lodash.debounce';
import get from 'lodash/get';
import { isEmptyValue } from '../modules/utils.js';

class FormComponent extends PureComponent {
  constructor(props, context) {
    super(props);

    const value = this.getValue(props, context);

    if (this.showCharsRemaining(props)) {
      const characterCount = value ? value.length : 0;
      this.state = {
        charsRemaining: props.max - characterCount,
      };
    }
  }

  handleChange = (name, value) => {
    if (!!value) {
      // if this is a number field, convert value before sending it up to Form
      if (this.getType() === 'number') {
        value = Number(value);
      }
      this.context.updateCurrentValues({ [this.props.path]: value });
    } else {
      this.context.updateCurrentValues({ [this.props.path]: null });
    }

    // for text fields, update character count on change
    if (this.showCharsRemaining()) {
      this.updateCharacterCount(value);
    }
  };

  /*

  Note: not currently used because when function is debounced
  some changes might not register if the user submits form too soon

  */
  handleChangeDebounced = debounce(this.handleChange, 500, { leading: true });

  updateCharacterCount = (value) => {
    const characterCount = value ? value.length : 0;
    this.setState({
      charsRemaining: this.props.max - characterCount,
    });
  };

  /*

  Get value from Form state through context

  */
  getValue = (props, context) => {
    const p = props || this.props;
    const c = context || this.context;

    // note: value has to default to '' to make component controlled
    let value = get(c.getDocument(), p.path) || '';

    // replace empty value, which has not been prefilled, by the default value from the schema
    // keep defaultValue for backwards compatibility even though it doesn't actually work
    if (isEmptyValue(value)) {
      if (p.defaultValue) value = p.defaultValue;
      if (p.default) value = p.default;
    }
    return value;
  };

  /*

  Whether to keep track of and show remaining chars

  */
  showCharsRemaining = (props) => {
    const p = props || this.props;
    return p.max && ['url', 'email', 'textarea', 'text'].includes(this.getType(p));
  }

  /*

  Get errors from Form state through context

  */
  getErrors = () => {
    const fieldErrors = this.context.errors.filter(error => error.data.name === this.props.path);
    return fieldErrors;
  };

  /*

  Get form control type, either based on control props, or by guessing
  based on form field type

  */
  getType = (props) => {
    const p = props || this.props;
    const fieldType = p.datatype && p.datatype[0].type;
    const autoType =
      fieldType === Number ? 'number' : fieldType === Boolean ? 'checkbox' : fieldType === Date ? 'date' : 'text';
    return p.control || autoType;
  };

  renderComponent() {
    const {
      control,
      updateCurrentValues,
      beforeComponent,
      afterComponent,
      nestedSchema,
      nestedFields,
      datatype,
      options,
      path,
      name,
      label,
      form,
      formType,
    } = this.props;

    // these properties are whitelisted so that they can be safely passed to the actual form input
    // and avoid https://facebook.github.io/react/warnings/unknown-prop.html warnings
    const inputProperties = {
      name,
      options,
      label,
      onChange: this.handleChange,
      value: this.getValue(),
      ...form,
    };

    const properties = { ...this.props, inputProperties };

    // if control is a React component, use it
    if (typeof control === 'function') {
      const ControlComponent = control;
      return <ControlComponent {...properties} />;
    } else {
      // else pick a predefined component

      switch (this.getType()) {
        case 'nested':
          return (
            <Components.FormNested
              path={path}
              updateCurrentValues={updateCurrentValues}
              nestedSchema={nestedSchema}
              nestedFields={nestedFields}
              datatype={datatype}
              {...properties}
            />
          );

        case 'number':
          return <Components.FormComponentNumber {...properties} />;

        case 'url':
          return <Components.FormComponentUrl {...properties} />;

        case 'email':
          return <Components.FormComponentEmail {...properties} />;

        case 'textarea':
          return <Components.FormComponentTextarea {...properties} />;

        case 'checkbox':
          // formsy-react-components expects a boolean value for checkbox
          // https://github.com/twisty/formsy-react-components/blob/v0.11.1/src/checkbox.js#L20
          properties.value = !!properties.value;
          return <Components.FormComponentCheckbox {...properties} />;

        case 'checkboxgroup':
          // formsy-react-components expects an array value
          // https://github.com/twisty/formsy-react-components/blob/v0.11.1/src/checkbox-group.js#L42
          if (!Array.isArray(properties.value)) {
            properties.value = [properties.value];
          }

          // in case of checkbox groups, check "checked" option to populate value if this is a "new document" form
          const checkedValues = _.where(properties.options, { checked: true }).map(option => option.value);
          if (checkedValues.length && !properties.value && formType === 'new') {
            properties.value = checkedValues;
          }
          return <Components.FormComponentCheckboxGroup {...properties} />;

        case 'radiogroup':
          // TODO: remove this?
          // formsy-react-compnents RadioGroup expects an onChange callback
          // https://github.com/twisty/formsy-react-components/blob/v0.11.1/src/radio-group.js#L33
          // properties.onChange = (name, value) => {
          //   this.context.updateCurrentValues({ [name]: value });
          // };
          return <Components.FormComponentRadioGroup {...properties} />;

        case 'select':
          const noneOption = {
            label: this.context.intl.formatMessage({ id: 'forms.select_option' }),
            value: '',
            disabled: true,
          };

          properties.options = [noneOption, ...properties.options];
          return <Components.FormComponentSelect {...properties} />;

        case 'selectmultiple':
          properties.multiple = true;
          return <Components.FormComponentSelect {...properties} />;

        case 'datetime':
          return <Components.FormComponentDateTime {...properties} />;

        case 'date':
          return <Components.FormComponentDate {...properties} />;

        case 'time':
          return <Components.FormComponentTime {...properties} />;

        case 'text':
          return <Components.FormComponentDefault {...properties} />;

        default:
          const CustomComponent = Components[control];
          return CustomComponent ? (
            <CustomComponent {...properties} />
          ) : (
            <Components.FormComponentDefault {...properties} />
          );
      }
    }
  }

  showClear = () => {
    return ['datetime', 'time', 'select', 'radiogroup'].includes(this.props.control);
  };

  clearField = e => {
    e.preventDefault();
    const fieldName = this.props.name;
    // clear value
    this.context.updateCurrentValues({ [fieldName]: null });
    // add it to unset
    // TODO: not needed anymore?
    // this.context.addToDeletedValues(fieldName);
  };

  renderClear() {
    return (
      <a
        href="javascript:void(0)"
        className="form-component-clear"
        title={this.context.intl.formatMessage({ id: 'forms.clear_field' })}
        onClick={this.clearField}
      >
        <span>✕</span>
      </a>
    );
  }

  render() {
    const { beforeComponent, afterComponent, max, name, control } = this.props;

    const hasErrors = this.getErrors() && this.getErrors().length;
    const inputClass = classNames(
      'form-input',
      `input-${name}`,
      `form-component-${control || 'default'}`,
      { 'input-error': hasErrors }
    );

    return (
      <div className={inputClass}>
        {beforeComponent ? beforeComponent : null}
        {this.renderComponent()}
        {hasErrors ? <Components.FieldErrors errors={this.getErrors()} /> : null}
        {this.showClear() ? this.renderClear() : null}
        {this.showCharsRemaining() && <div className={classNames('form-control-limit', { danger: this.state.charsRemaining < 10 })}>{this.state.charsRemaining}</div>}
        {afterComponent ? afterComponent : null}
      </div>
    );
  }
}

FormComponent.propTypes = {
  document: PropTypes.object,
  name: PropTypes.string,
  label: PropTypes.string,
  value: PropTypes.any,
  placeholder: PropTypes.string,
  prefilledValue: PropTypes.any,
  options: PropTypes.any,
  control: PropTypes.any,
  datatype: PropTypes.any,
  disabled: PropTypes.bool,
  updateCurrentValues: PropTypes.func,
};

FormComponent.contextTypes = {
  intl: intlShape,
  addToDeletedValues: PropTypes.func,
  errors: PropTypes.array,
  currentValues: PropTypes.object,
  autofilledValues: PropTypes.object,
  deletedValues: PropTypes.array,
  getDocument: PropTypes.func,
  updateCurrentValues: PropTypes.func,
};

registerComponent('FormComponent', FormComponent);
